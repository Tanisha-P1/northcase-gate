import { createReadStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CASE_STAGES,
  DOCUMENT_CATEGORIES,
  RELATIONSHIP_MANAGERS,
} from './database.mjs'
import {
  acknowledgeHandoff,
  approveReminder,
  createHandoff,
  createReminderDraft,
  getAnalytics,
  getCaseDetails,
  getHandoffs,
  getQueue,
  getReminder,
  receiveDocument,
  scheduleReminder,
  simulateReminderSend,
  updateReminderDraft,
  waiveDocument,
  WorkflowError,
} from './workflow.mjs'

const serverDirectory = fileURLToPath(new URL('.', import.meta.url))
const frontendDirectory = resolve(serverDirectory, '..', 'frontend', 'dist')
const roles = new Set(['RM', 'OPS', 'ANALYST', 'COO'])
const fixedActors = {
  OPS: 'Ops Coordinator',
  ANALYST: 'Liam Chen',
  COO: 'Morgan Ellis',
}
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function requestContext(request) {
  const role = request.headers['x-demo-role'] ?? 'OPS'
  if (!roles.has(role)) throw new WorkflowError(400, 'Unknown demo role.')
  const defaultActor = role === 'RM' ? 'Sarah Jenkins' : fixedActors[role]
  const actor = request.headers['x-demo-actor'] ?? defaultActor
  if (role === 'RM' && !RELATIONSHIP_MANAGERS.includes(actor)) {
    throw new WorkflowError(400, 'Select a valid demo Relationship Manager.')
  }
  if (role !== 'RM' && actor !== defaultActor) {
    throw new WorkflowError(400, 'Select the configured actor for this demo role.')
  }
  return { role, actor }
}

async function readJsonBody(request) {
  const maximumBytes = 20_000
  const chunks = []
  let totalBytes = 0

  for await (const chunk of request) {
    totalBytes += chunk.length
    if (totalBytes > maximumBytes) throw new WorkflowError(413, 'Request body is too large.')
    chunks.push(chunk)
  }
  if (totalBytes === 0) return {}
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || Array.isArray(body) || typeof body !== 'object') {
      throw new WorkflowError(400, 'Request body must be a JSON object.')
    }
    return body
  } catch (error) {
    if (error instanceof WorkflowError) throw error
    throw new WorkflowError(400, 'Request body must contain valid JSON.')
  }
}

function requiredText(value, label, maximumLength = 1000) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximumLength) {
    throw new WorkflowError(400, `${label} is required and must be at most ${maximumLength} characters.`)
  }
  return value.trim()
}

function serveFrontend(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 404, { error: 'Route not found.' })
    return
  }
  const decodedPath = decodeURIComponent(pathname)
  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath
  let filePath = resolve(frontendDirectory, `.${requestedPath}`)
  const safeRoot = `${frontendDirectory}${sep}`
  if (filePath !== resolve(frontendDirectory, 'index.html') && !filePath.startsWith(safeRoot)) {
    sendJson(response, 400, { error: 'Invalid path.' })
    return
  }
  if (!existsSync(filePath)) {
    if (!extname(requestedPath) && existsSync(resolve(frontendDirectory, 'index.html'))) {
      filePath = resolve(frontendDirectory, 'index.html')
    } else {
      sendJson(response, 404, { error: 'Production frontend is not built. Run npm run build.' })
      return
    }
  }

  response.writeHead(200, {
    'Cache-Control': requestedPath === '/index.html' ? 'no-cache' : 'public, max-age=3600',
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(filePath).pipe(response)
}

function matchRoute(pathname, expression) {
  const match = pathname.match(expression)
  return match?.slice(1).map(decodeURIComponent) ?? null
}

export function createApiServer({
  db,
  overdueDays = 7,
  aiServiceUrl = process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000',
  aiServiceTimeoutSeconds = Number(process.env.AI_SERVICE_TIMEOUT_SECONDS ?? 35),
  aiServiceToken = process.env.AI_SERVICE_TOKEN ?? '',
}) {
  if (!Number.isInteger(overdueDays) || overdueDays < 1 || overdueDays > 90) {
    throw new Error('NG_OVERDUE_DAYS must be a whole number between 1 and 90.')
  }

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) {
      try {
        serveFrontend(request, response, url.pathname)
      } catch (error) {
        console.error('Frontend request failed:', error)
        sendJson(response, 400, { error: 'Invalid frontend path.' })
      }
      return
    }

    try {
      const context = requestContext(request)
      const method = request.method ?? 'GET'
      const { pathname } = url

      if (method === 'GET' && pathname === '/api/health') {
        sendJson(response, 200, {
          status: 'ok',
          syntheticOnly: true,
          realEmailSending: false,
          aiConfigured: Boolean(aiServiceToken && process.env.GEMINI_API_KEY),
        })
        return
      }

      if (method === 'POST' && pathname === '/api/assistant/ask') {
        const body = await readJsonBody(request)
        const question = requiredText(body.question, 'Question', 1000)
        if (question.length < 3) throw new WorkflowError(400, 'Question must be at least 3 characters.')
        if (!aiServiceToken) {
          throw new WorkflowError(503, 'Set AI_SERVICE_TOKEN in .env to enable the protected AI service.')
        }

        let aiResponse
        try {
          aiResponse = await fetch(new URL('/ask', aiServiceUrl), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-ai-service-token': aiServiceToken,
              'x-demo-role': context.role,
              'x-demo-actor': context.actor,
            },
            body: JSON.stringify({ question }),
            signal: AbortSignal.timeout(aiServiceTimeoutSeconds * 1000),
          })
        } catch (error) {
          if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            throw new WorkflowError(504, 'The AI assistant timed out. Please try again.')
          }
          console.error('AI service is unavailable:', error.message)
          throw new WorkflowError(503, 'The AI assistant is temporarily unavailable.')
        }
        let aiResult
        try {
          aiResult = await aiResponse.json()
        } catch {
          throw new WorkflowError(502, 'The AI service returned an invalid response.')
        }
        if (!aiResponse.ok) {
          throw new WorkflowError(
            aiResponse.status,
            typeof aiResult.detail === 'string' ? aiResult.detail : 'The AI assistant could not complete this request.',
          )
        }
        sendJson(response, 200, aiResult)
        return
      }

      if (method === 'POST' && pathname === '/api/assistant/reminder-draft') {
        const body = await readJsonBody(request)
        if (context.role !== 'RM') {
          throw new WorkflowError(403, 'Only a Relationship Manager may save an AI-assisted reminder draft.')
        }
        const reminder = createReminderDraft(
          db,
          requiredText(body.caseId, 'Case ID', 32),
          body.documentIds,
          context,
          overdueDays,
          new Date(),
          {
            subject: body.subject,
            body: body.body,
            dueAt: body.dueAt,
            aiAssisted: true,
          },
        )
        sendJson(response, 201, { reminder })
        return
      }

      if (method === 'GET' && pathname === '/api/bootstrap') {
        sendJson(response, 200, {
          role: context.role,
          actor: context.actor,
          roles: [
            { role: 'RM', actor: 'Sarah Jenkins', label: 'Relationship Manager' },
            { role: 'RM', actor: 'Marcus Vance', label: 'Relationship Manager' },
            { role: 'RM', actor: 'Elena Rostova', label: 'Relationship Manager' },
            { role: 'RM', actor: 'David Kim', label: 'Relationship Manager' },
            { role: 'OPS', actor: 'Ops Coordinator', label: 'Ops Coordinator' },
            { role: 'ANALYST', actor: 'Liam Chen', label: 'KYC Analyst' },
            { role: 'COO', actor: 'Morgan Ellis', label: 'COO (aggregate only)' },
          ],
          relationshipManagers: RELATIONSHIP_MANAGERS,
          stages: CASE_STAGES,
          categories: DOCUMENT_CATEGORIES,
          overdueAfterDays: overdueDays,
        })
        return
      }

      if (method === 'GET' && pathname === '/api/queue') {
        sendJson(response, 200, getQueue(db, context, {
          rm: url.searchParams.get('rm') ?? '',
          stage: url.searchParams.get('stage') ?? '',
          aging: url.searchParams.get('aging') ?? '',
          search: url.searchParams.get('search') ?? '',
        }, overdueDays))
        return
      }

      if (method === 'GET' && pathname === '/api/analytics') {
        if (!['OPS', 'COO'].includes(context.role)) {
          throw new WorkflowError(403, 'Stage analytics are available to Ops and the COO only.')
        }
        sendJson(response, 200, getAnalytics(db))
        return
      }

      if (method === 'GET' && pathname === '/api/handoffs') {
        sendJson(response, 200, {
          handoffs: getHandoffs(db, url.searchParams.get('caseId') ?? '', context),
        })
        return
      }

      const caseMatch = matchRoute(pathname, /^\/api\/cases\/([^/]+)$/)
      if (method === 'GET' && caseMatch) {
        sendJson(response, 200, getCaseDetails(db, caseMatch[0], context, overdueDays))
        return
      }

      const receiveMatch = matchRoute(pathname, /^\/api\/cases\/([^/]+)\/documents\/([^/]+)\/receive$/)
      if (method === 'POST' && receiveMatch) {
        receiveDocument(db, receiveMatch[0], receiveMatch[1], context)
        sendJson(response, 200, { received: true })
        return
      }

      const waiveMatch = matchRoute(pathname, /^\/api\/cases\/([^/]+)\/documents\/([^/]+)\/waive$/)
      if (method === 'POST' && waiveMatch) {
        const body = await readJsonBody(request)
        waiveDocument(db, waiveMatch[0], waiveMatch[1], body.reason, context)
        sendJson(response, 200, { waived: true })
        return
      }

      const caseReminderMatch = matchRoute(pathname, /^\/api\/cases\/([^/]+)\/reminders$/)
      if (method === 'POST' && caseReminderMatch) {
        const body = await readJsonBody(request)
        const reminder = createReminderDraft(
          db,
          caseReminderMatch[0],
          body.documentIds,
          context,
          overdueDays,
        )
        sendJson(response, 201, { reminder })
        return
      }

      const caseHandoffMatch = matchRoute(pathname, /^\/api\/cases\/([^/]+)\/handoffs$/)
      if (method === 'POST' && caseHandoffMatch) {
        const body = await readJsonBody(request)
        const handoff = createHandoff(
          db,
          caseHandoffMatch[0],
          requiredText(body.documentId, 'Document'),
          requiredText(body.message, 'Handoff note', 1000),
          context,
        )
        sendJson(response, 201, { handoff })
        return
      }

      const reminderMatch = matchRoute(pathname, /^\/api\/reminders\/([^/]+)$/)
      if (method === 'GET' && reminderMatch) {
        sendJson(response, 200, getReminder(db, reminderMatch[0], context))
        return
      }
      if (method === 'PATCH' && reminderMatch) {
        const body = await readJsonBody(request)
        const reminder = updateReminderDraft(db, reminderMatch[0], body, context)
        sendJson(response, 200, { reminder })
        return
      }

      const reminderActionMatch = matchRoute(pathname, /^\/api\/reminders\/([^/]+)\/(approve|schedule|send)$/)
      if (method === 'POST' && reminderActionMatch) {
        const [, reminderId, action] = reminderActionMatch
        if (action === 'approve') {
          const reminder = approveReminder(db, reminderId, context)
          sendJson(response, 200, { reminder })
          return
        }
        if (action === 'schedule') {
          const body = await readJsonBody(request)
          const reminder = scheduleReminder(db, reminderId, body.scheduleAt, context)
          sendJson(response, 200, { reminder })
          return
        }
        const reminder = simulateReminderSend(db, reminderId, context)
        sendJson(response, 200, { reminder })
        return
      }

      const acknowledgeMatch = matchRoute(pathname, /^\/api\/handoffs\/([^/]+)\/acknowledge$/)
      if (method === 'POST' && acknowledgeMatch) {
        acknowledgeHandoff(db, acknowledgeMatch[0], context)
        sendJson(response, 200, { acknowledged: true })
        return
      }

      sendJson(response, 404, { error: 'API route not found.' })
    } catch (error) {
      if (error instanceof WorkflowError) {
        sendJson(response, error.status, { error: error.message })
        return
      }
      console.error('API request failed:', error)
      sendJson(response, 500, { error: 'The request could not be completed. Check the server log for details.' })
    }
  })
}
