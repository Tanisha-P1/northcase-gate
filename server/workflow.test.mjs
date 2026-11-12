import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { createDatabase } from './database.mjs'
import {
  approveReminder,
  createReminderDraft,
  getReminder,
  simulateReminderSend,
  WorkflowError,
} from './workflow.mjs'

const now = new Date('2026-11-11T09:00:00.000Z')
const rmContext = { role: 'RM', actor: 'Sarah Jenkins' }
const databases = new Set()

function database() {
  const db = createDatabase(':memory:', now)
  databases.add(db)
  return db
}

afterEach(() => {
  for (const db of databases) db.close()
  databases.clear()
})

describe('reminder approval controls', () => {
  it('creates an AI-assisted reminder as an unapproved draft with an audit event', () => {
    const db = database()
    const reminder = createReminderDraft(
      db,
      'NG-2026-8101',
      ['DOC-8101-2'],
      rmContext,
      7,
      now,
      {
        subject: 'Missing synthetic organisation documents',
        body: 'Please share the synthetic organisation documents by the date below.',
        dueAt: '2026-11-14',
        aiAssisted: true,
      },
    )
    const details = getReminder(db, reminder.id, rmContext)
    const event = db.prepare(`
      SELECT event_type, summary, metadata FROM events
      WHERE reminder_id = ? ORDER BY id DESC LIMIT 1
    `).get(reminder.id)

    assert.equal(reminder.status, 'DRAFT')
    assert.equal(reminder.approvedBy, null)
    assert.equal(reminder.sentAt, null)
    assert.equal(details.documents[0].id, 'DOC-8101-2')
    assert.equal(event.event_type, 'REMINDER_DRAFTED')
    assert.match(event.summary, /approval is required/i)
    assert.equal(JSON.parse(event.metadata).aiAssisted, true)
  })

  it('does not simulate delivery before explicit assigned-RM approval', () => {
    const db = database()
    const reminder = createReminderDraft(db, 'NG-2026-8101', ['DOC-8101-2'], rmContext, 7, now)

    assert.throws(
      () => simulateReminderSend(db, reminder.id, rmContext, now),
      (error) => error instanceof WorkflowError && error.status === 409,
    )
    assert.equal(db.prepare(`
      SELECT COUNT(*) AS count FROM events WHERE reminder_id = ? AND event_type = ?
    `).get(reminder.id, 'REMINDER_SENT').count, 0)
  })

  it('records an approved delivery as simulation-only, never as a real email', () => {
    const db = database()
    const reminder = createReminderDraft(db, 'NG-2026-8101', ['DOC-8101-2'], rmContext, 7, now)
    approveReminder(db, reminder.id, rmContext, now)
    const result = simulateReminderSend(db, reminder.id, rmContext, new Date('2026-11-11T10:00:00.000Z'))
    const event = db.prepare(`
      SELECT summary, metadata FROM events
      WHERE reminder_id = ? AND event_type = 'REMINDER_SENT'
    `).get(reminder.id)

    assert.equal(result.status, 'SENT')
    assert.equal(result.simulated, true)
    assert.match(event.summary, /no email was transmitted/i)
    assert.deepEqual(JSON.parse(event.metadata), { simulated: true, transmitted: false })
  })

  it('rejects invalid AI-generated due dates and reminder text before storing a draft', () => {
    const db = database()

    assert.throws(
      () => createReminderDraft(db, 'NG-2026-8101', ['DOC-8101-2'], rmContext, 7, now, {
        subject: 'Subject',
        body: 'This body is definitely long enough for validation.',
        dueAt: 'not-a-date',
        aiAssisted: true,
      }),
      (error) => error instanceof WorkflowError && error.status === 400,
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reminders').get().count, 0)
  })
})
