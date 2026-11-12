import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer } from 'node:http'
import { createDatabase } from './database.mjs'
import { createApiServer } from './app.mjs'

const db = createDatabase(':memory:', new Date('2026-11-11T09:00:00.000Z'))
const upstream = createServer(async (request, response) => {
  if (request.url !== '/ask' || request.method !== 'POST') {
    response.writeHead(404).end()
    return
  }
  const token = request.headers['x-ai-service-token']
  const role = request.headers['x-demo-role']
  const actor = request.headers['x-demo-actor']
  let body = ''
  for await (const chunk of request) body += chunk
  if (token !== 'synthetic-internal-secret') {
    response.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ detail: 'unauthorised' }))
    return
  }
  if (role === 'RM' && actor === 'Sarah Jenkins' && JSON.parse(body).question === 'Which documents are missing?') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      answer: 'The application found outstanding documents.',
      sources: [{ caseId: 'NG-2026-8101', label: 'NG-2026-8101', kind: 'case' }],
      model: 'mock-gemini',
      reminderDraft: null,
    }))
    return
  }
  response.writeHead(403, { 'Content-Type': 'application/json' }).end(JSON.stringify({ detail: 'Access denied.' }))
})

const aiPort = await new Promise((resolve) => upstream.listen(0, '127.0.0.1', () => resolve(upstream.address().port)))
const apiServer = createApiServer({
  db,
  overdueDays: 7,
  aiServiceUrl: `http://127.0.0.1:${aiPort}`,
  aiServiceToken: 'synthetic-internal-secret',
})
const apiPort = await new Promise((resolve) => apiServer.listen(0, '127.0.0.1', () => resolve(apiServer.address().port)))
const baseUrl = `http://127.0.0.1:${apiPort}`

before(() => {})
after(async () => {
  await Promise.all([
    new Promise((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve())),
    new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve())),
  ])
  db.close()
})

describe('AI service Node proxy', () => {
  it('forwards only through the server using validated demo context', async () => {
    const response = await fetch(`${baseUrl}/api/assistant/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'RM',
        'x-demo-actor': 'Sarah Jenkins',
      },
      body: JSON.stringify({ question: 'Which documents are missing?' }),
    })

    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.model, 'mock-gemini')
    assert.equal(result.sources[0].caseId, 'NG-2026-8101')
    assert.equal(Object.hasOwn(result, 'apiKey'), false)
  })

  it('does not permit a forged user to select another demo actor', async () => {
    const response = await fetch(`${baseUrl}/api/assistant/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'RM',
        'x-demo-actor': 'Ops Coordinator',
      },
      body: JSON.stringify({ question: 'Which documents are missing?' }),
    })

    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /Relationship Manager/)
  })

  it('never allows non-RM identities to save an AI-assisted reminder', async () => {
    const response = await fetch(`${baseUrl}/api/assistant/reminder-draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'OPS',
        'x-demo-actor': 'Ops Coordinator',
      },
      body: JSON.stringify({
        caseId: 'NG-2026-8101',
        documentIds: ['DOC-8101-2'],
        subject: 'Synthetic document follow-up',
        body: 'Please share the synthetic corporate document.',
        dueAt: '2026-11-14',
      }),
    })

    assert.equal(response.status, 403)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reminders').get().count, 0)
  })

  it('saves an RM AI draft as unapproved and records a case event', async () => {
    const response = await fetch(`${baseUrl}/api/assistant/reminder-draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'RM',
        'x-demo-actor': 'Sarah Jenkins',
      },
      body: JSON.stringify({
        caseId: 'NG-2026-8101',
        documentIds: ['DOC-8101-2'],
        subject: 'Synthetic document follow-up',
        body: 'Please share the synthetic corporate document by the requested due date.',
        dueAt: '2026-11-14',
      }),
    })

    assert.equal(response.status, 201)
    const result = await response.json()
    assert.equal(result.reminder.status, 'DRAFT')
    assert.equal(result.reminder.approvedBy, null)
    assert.equal(result.reminder.sentAt, null)
    const event = db.prepare(`
      SELECT event_type, metadata FROM events
      WHERE reminder_id = ? ORDER BY id DESC LIMIT 1
    `).get(result.reminder.id)
    assert.equal(event.event_type, 'REMINDER_DRAFTED')
    assert.equal(JSON.parse(event.metadata).aiAssisted, true)
  })
})
