import { randomUUID } from 'node:crypto'
import { addCaseEvent, dateAfter, DOCUMENT_CATEGORIES } from './database.mjs'

const DAY_MS = 24 * 60 * 60 * 1000

export class WorkflowError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'WorkflowError'
    this.status = status
  }
}

function fail(status, message) {
  throw new WorkflowError(status, message)
}

function inTransaction(db, action) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = action()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function ageInDays(start, now) {
  return Math.max(
    0,
    Math.floor((Date.parse(dateOnly(now)) - Date.parse(dateOnly(start))) / DAY_MS),
  )
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function caseById(db, caseId) {
  return db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId)
}

function documentById(db, documentId) {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId)
}

function reminderById(db, reminderId) {
  return db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId)
}

function documentFollowUp(db, document, overdueDays) {
  const lastReminder = db.prepare(`
    SELECT occurred_at FROM events
    WHERE document_id = ? AND event_type = 'REMINDER_SENT'
    ORDER BY occurred_at DESC LIMIT 1
  `).get(document.id)
  const followUpDate = dateOnly(dateAfter(lastReminder?.occurred_at ?? document.requested_at, overdueDays))
  const today = dateOnly(new Date())
  const status = followUpDate < today
    ? 'OVERDUE'
    : followUpDate === today
      ? 'DUE_TODAY'
      : 'REQUESTED'

  return {
    followUpDate,
    status,
    ageDays: ageInDays(document.requested_at, new Date()),
  }
}

function toDocumentView(db, document, overdueDays) {
  const followUp = document.status === 'REQUESTED'
    ? documentFollowUp(db, document, overdueDays)
    : { followUpDate: null, status: document.status, ageDays: ageInDays(document.requested_at, new Date()) }

  return {
    id: document.id,
    name: document.name,
    category: document.category,
    status: followUp.status,
    storedStatus: document.status,
    owner: document.owner,
    requestedAt: document.requested_at,
    chaseRound: document.chase_round,
    receivedAt: document.received_at,
    waivedReason: document.waived_reason,
    followUpDate: followUp.followUpDate,
    ageDays: followUp.ageDays,
  }
}

function outstandingDocuments(db, caseId, overdueDays) {
  return db.prepare(`
    SELECT * FROM documents
    WHERE case_id = ? AND status = 'REQUESTED'
    ORDER BY requested_at ASC
  `).all(caseId).map((document) => toDocumentView(db, document, overdueDays))
}

function assertCaseAccess(db, caseRow, context) {
  if (!caseRow) fail(404, 'Case not found.')
  if (context.role === 'OPS') return
  if (context.role === 'RM' && context.actor === caseRow.rm_name) return
  if (context.role === 'ANALYST') {
    const linked = db.prepare(`
      SELECT 1 FROM handoffs
      WHERE case_id = ? AND (analyst_name = ? OR target_rm = ?)
      LIMIT 1
    `).get(caseRow.id, context.actor, context.actor)
    if (linked) return
  }
  fail(403, 'This demo role cannot access the case.')
}

function assertCaseWriter(caseRow, context) {
  if (context.role === 'OPS') return
  if (context.role === 'RM' && context.actor === caseRow.rm_name) return
  fail(403, 'Only Ops or the assigned RM can change this case.')
}

function caseSummary(db, caseRow, overdueDays) {
  const documents = outstandingDocuments(db, caseRow.id, overdueDays)
  const nextDocument = [...documents].sort((a, b) => a.followUpDate.localeCompare(b.followUpDate))[0]
  const nextFollowUp = nextDocument?.followUpDate ?? null
  const today = dateOnly(new Date())
  const status = !nextFollowUp || nextFollowUp > today
    ? 'ON_TRACK'
    : nextFollowUp === today
      ? 'DUE_TODAY'
      : 'OVERDUE'

  return {
    id: caseRow.id,
    clientName: caseRow.client_name,
    industry: caseRow.industry,
    rmName: caseRow.rm_name,
    daysOpen: ageInDays(caseRow.created_at, new Date()),
    currentStage: caseRow.current_stage,
    outstandingCount: documents.length,
    oldestOutstandingAge: documents.reduce((age, item) => Math.max(age, item.ageDays), 0),
    oldestOutstandingDocumentId: documents[0]?.id ?? null,
    oldestOutstandingDocumentName: documents[0]?.name ?? null,
    nextFollowUp,
    status,
  }
}

export function getQueue(db, { role, actor }, filters = {}, overdueDays = 7) {
  if (role === 'COO') fail(403, 'The COO view is aggregate-only.')

  let rows
  if (role === 'RM') {
    rows = db.prepare('SELECT * FROM cases WHERE rm_name = ?').all(actor)
  } else if (role === 'ANALYST') {
    rows = db.prepare(`
      SELECT DISTINCT cases.* FROM cases
      JOIN handoffs ON handoffs.case_id = cases.id
      WHERE handoffs.analyst_name = ? OR handoffs.target_rm = ?
    `).all(actor, actor)
  } else {
    rows = db.prepare('SELECT * FROM cases').all()
  }

  let cases = rows.map((row) => caseSummary(db, row, overdueDays))
  if (filters.rm) cases = cases.filter((item) => item.rmName === filters.rm)
  if (filters.stage) cases = cases.filter((item) => item.currentStage === filters.stage)
  if (filters.aging === 'overdue') cases = cases.filter((item) => item.status === 'OVERDUE')
  if (filters.aging === 'due-today') cases = cases.filter((item) => item.status === 'DUE_TODAY')
  if (filters.aging === '14') cases = cases.filter((item) => item.oldestOutstandingAge > 14)
  if (filters.aging === '30') cases = cases.filter((item) => item.oldestOutstandingAge > 30)
  if (filters.search) {
    const query = filters.search.trim().toLocaleLowerCase()
    cases = cases.filter((item) =>
      `${item.clientName} ${item.id} ${item.rmName}`.toLocaleLowerCase().includes(query))
  }
  cases.sort((a, b) =>
    b.oldestOutstandingAge - a.oldestOutstandingAge || a.clientName.localeCompare(b.clientName))

  const chaseDurations = db.prepare(`
    SELECT duration_days FROM stage_durations WHERE stage = 'Chasing Missing Docs'
  `).all().map((row) => row.duration_days)

  return {
    cases,
    summary: {
      casesOpen: cases.length,
      casesOverdue: cases.filter((item) => item.status === 'OVERDUE').length,
      medianDaysInChaseStage: median(chaseDurations),
    },
    filters: {
      relationshipManagers: [...new Set(rows.map((row) => row.rm_name))].sort(),
      stages: [...new Set(rows.map((row) => row.current_stage))].sort(),
    },
  }
}

export function getCaseDetails(db, caseId, context, overdueDays = 7) {
  const caseRow = caseById(db, caseId)
  assertCaseAccess(db, caseRow, context)
  const documents = db.prepare(`
    SELECT * FROM documents WHERE case_id = ?
    ORDER BY CASE category
      WHEN 'Constitutional Documents' THEN 1
      WHEN 'Ownership and UBO' THEN 2
      WHEN 'Registry Extracts' THEN 3
      WHEN 'Authorised Signatories' THEN 4
      ELSE 5
    END, requested_at ASC
  `).all(caseId).map((document) => toDocumentView(db, document, overdueDays))
  const events = db.prepare(`
    SELECT * FROM events WHERE case_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 100
  `).all(caseId).map((event) => ({
    id: event.id,
    documentId: event.document_id,
    reminderId: event.reminder_id,
    type: event.event_type,
    summary: event.summary,
    actor: event.actor,
    occurredAt: event.occurred_at,
    metadata: JSON.parse(event.metadata),
  }))
  const openHandoffs = db.prepare(`
    SELECT id, document_id AS documentId, analyst_name AS analystName,
      target_rm AS targetRM, message, status, created_at AS createdAt
    FROM handoffs WHERE case_id = ? AND status != 'CLOSED'
    ORDER BY created_at DESC
  `).all(caseId)

  return {
    case: caseSummary(db, caseRow, overdueDays),
    client: {
      contactName: caseRow.contact_name,
      contactEmail: caseRow.contact_email,
    },
    documents,
    categories: DOCUMENT_CATEGORIES,
    events,
    handoffs: openHandoffs,
    overdueAfterDays: overdueDays,
  }
}

export function receiveDocument(db, caseId, documentId, context, now = new Date()) {
  const caseRow = caseById(db, caseId)
  assertCaseAccess(db, caseRow, context)
  assertCaseWriter(caseRow, context)
  const document = documentById(db, documentId)
  if (!document || document.case_id !== caseId) fail(404, 'Document not found in this case.')
  if (document.status !== 'REQUESTED') fail(409, 'Only a requested document can be marked received.')

  const occurredAt = now.toISOString()
  inTransaction(db, () => {
    db.prepare(`
      UPDATE documents SET status = 'RECEIVED', received_at = ? WHERE id = ?
    `).run(occurredAt, documentId)
    addCaseEvent(db, {
      caseId,
      documentId,
      type: 'DOCUMENT_RECEIVED',
      summary: `${document.name} marked as received.`,
      actor: context.actor,
      occurredAt,
    })
  })
  return { received: true }
}

export function waiveDocument(db, caseId, documentId, reason, context, now = new Date()) {
  const caseRow = caseById(db, caseId)
  assertCaseAccess(db, caseRow, context)
  assertCaseWriter(caseRow, context)
  const document = documentById(db, documentId)
  if (!document || document.case_id !== caseId) fail(404, 'Document not found in this case.')
  if (document.status !== 'REQUESTED') fail(409, 'Only a requested document can be waived.')
  if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
    fail(400, 'Enter a waiver reason between 5 and 500 characters.')
  }

  const cleanReason = reason.trim()
  const occurredAt = now.toISOString()
  inTransaction(db, () => {
    db.prepare(`
      UPDATE documents SET status = 'WAIVED', waived_reason = ? WHERE id = ?
    `).run(cleanReason, documentId)
    addCaseEvent(db, {
      caseId,
      documentId,
      type: 'DOCUMENT_WAIVED',
      summary: `${document.name} waived: ${cleanReason}`,
      actor: context.actor,
      occurredAt,
      metadata: { reason: cleanReason },
    })
  })
  return { waived: true }
}

function reminderView(reminder, caseRow) {
  return {
    id: reminder.id,
    caseId: reminder.case_id,
    clientName: caseRow.client_name,
    rmName: caseRow.rm_name,
    recipient: reminder.recipient,
    subject: reminder.subject,
    body: reminder.body,
    dueAt: reminder.due_at,
    status: reminder.status,
    createdBy: reminder.created_by,
    createdAt: reminder.created_at,
    approvedBy: reminder.approved_by,
    approvedAt: reminder.approved_at,
    scheduleAt: reminder.schedule_at,
    sentAt: reminder.sent_at,
    simulated: Boolean(reminder.simulated),
  }
}

function assertReminderAccess(db, reminder, context) {
  if (!reminder) fail(404, 'Reminder not found.')
  const caseRow = caseById(db, reminder.case_id)
  assertCaseAccess(db, caseRow, context)
  return caseRow
}

export function createReminderDraft(
  db,
  caseId,
  documentIds,
  context,
  overdueDays = 7,
  now = new Date(),
  content = {},
) {
  const caseRow = caseById(db, caseId)
  assertCaseAccess(db, caseRow, context)
  assertCaseWriter(caseRow, context)
  if (!Array.isArray(documentIds) || documentIds.length === 0 || documentIds.length > 50) {
    fail(400, 'Select one or more outstanding documents for the reminder.')
  }

  const uniqueIds = [...new Set(documentIds)]
  if (uniqueIds.length !== documentIds.length) fail(400, 'A document can only appear once in a reminder.')
  const allOutstanding = outstandingDocuments(db, caseId, overdueDays)
  const selected = uniqueIds.map((id) => allOutstanding.find((item) => item.id === id))
  if (selected.some((item) => !item)) fail(409, 'Every reminder item must still be outstanding in this case.')

  const reminderId = `REM-${randomUUID()}`
  const dueAt = dateAfter(now, 3).slice(0, 10)
  const documentList = selected.map((item) => `- ${item.name} (requested ${dateOnly(item.requestedAt)})`).join('\n')
  const defaultSubject = `Documents needed to complete ${caseRow.client_name} onboarding (${caseRow.id})`
  const defaultBody = [
    `Hello ${caseRow.contact_name},`,
    '',
    `To keep ${caseRow.client_name}'s onboarding moving, please share the following outstanding documents:`,
    documentList,
    '',
    `Please send these by ${dueAt}. If you need help, reply to your Relationship Manager, ${caseRow.rm_name}.`,
    '',
    `Kind regards,`,
    caseRow.rm_name,
    'Northgate Corporate Onboarding',
  ].join('\n')
  const subject = content.subject ?? defaultSubject
  const body = content.body ?? defaultBody
  const reminderDueAt = content.dueAt ?? dueAt
  if (typeof subject !== 'string' || subject.trim().length < 5 || subject.length > 200) {
    fail(400, 'Reminder subject must be between 5 and 200 characters.')
  }
  if (typeof body !== 'string' || body.trim().length < 20 || body.length > 6000) {
    fail(400, 'Reminder message must be between 20 and 6,000 characters.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reminderDueAt) || Number.isNaN(Date.parse(`${reminderDueAt}T00:00:00Z`))) {
    fail(400, 'Enter a valid reminder due date.')
  }
  const createdAt = now.toISOString()

  inTransaction(db, () => {
    db.prepare(`
      INSERT INTO reminders (
        id, case_id, recipient, subject, body, due_at, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
    `).run(
      reminderId,
      caseId,
      caseRow.contact_email,
      subject,
      body,
      reminderDueAt,
      context.actor,
      createdAt,
    )

    addCaseEvent(db, {
      caseId,
      reminderId,
      type: 'REMINDER_DRAFTED',
      summary: `${content.aiAssisted ? 'AI-assisted ' : ''}reminder draft created for ${selected.length} outstanding document${selected.length === 1 ? '' : 's'}; assigned RM approval is required.`,
      actor: context.actor,
      occurredAt: createdAt,
      metadata: { documentIds: uniqueIds, aiAssisted: Boolean(content.aiAssisted) },
    })
  })
  return reminderView(reminderById(db, reminderId), caseRow)
}

export function getReminder(db, reminderId, context) {
  const reminder = reminderById(db, reminderId)
  const caseRow = assertReminderAccess(db, reminder, context)
  const event = db.prepare(`
    SELECT metadata FROM events
    WHERE reminder_id = ? AND event_type = 'REMINDER_DRAFTED'
    ORDER BY id LIMIT 1
  `).get(reminderId)
  const documentIds = event ? JSON.parse(event.metadata).documentIds : []
  const includedDocuments = documentIds
    .map((id) => documentById(db, id))
    .filter(Boolean)
    .map((document) => ({
      id: document.id,
      name: document.name,
      status: document.status,
      category: document.category,
    }))

  return { reminder: reminderView(reminder, caseRow), documents: includedDocuments }
}

export function updateReminderDraft(db, reminderId, input, context) {
  const reminder = reminderById(db, reminderId)
  const caseRow = assertReminderAccess(db, reminder, context)
  assertCaseWriter(caseRow, context)
  if (reminder.status !== 'DRAFT') fail(409, 'Only an unapproved draft can be edited.')
  const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  const dueAt = typeof input.dueAt === 'string' ? input.dueAt.trim() : ''
  if (subject.length < 5 || subject.length > 200) fail(400, 'Subject must be between 5 and 200 characters.')
  if (body.length < 20 || body.length > 6000) fail(400, 'Message must be between 20 and 6,000 characters.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt) || Number.isNaN(Date.parse(`${dueAt}T00:00:00Z`))) {
    fail(400, 'Enter a valid reminder due date.')
  }

  inTransaction(db, () => {
    db.prepare(`
      UPDATE reminders SET subject = ?, body = ?, due_at = ? WHERE id = ?
    `).run(subject, body, dueAt, reminderId)
    addCaseEvent(db, {
      caseId: caseRow.id,
      reminderId,
      type: 'REMINDER_EDITED',
      summary: 'Reminder subject, message, or due date updated.',
      actor: context.actor,
      occurredAt: new Date().toISOString(),
    })
  })
  return reminderView(reminderById(db, reminderId), caseRow)
}

export function approveReminder(db, reminderId, context, now = new Date()) {
  const reminder = reminderById(db, reminderId)
  const caseRow = assertReminderAccess(db, reminder, context)
  if (context.role !== 'RM' || context.actor !== caseRow.rm_name) {
    fail(403, 'Only the assigned RM can approve this reminder.')
  }
  if (reminder.status !== 'DRAFT') fail(409, 'Only a draft reminder can be approved.')

  const approvedAt = now.toISOString()
  inTransaction(db, () => {
    db.prepare(`
      UPDATE reminders SET status = 'APPROVED', approved_by = ?, approved_at = ? WHERE id = ?
    `).run(context.actor, approvedAt, reminderId)
    addCaseEvent(db, {
      caseId: caseRow.id,
      reminderId,
      type: 'REMINDER_APPROVED',
      summary: `Reminder explicitly approved by assigned RM ${context.actor}.`,
      actor: context.actor,
      occurredAt: approvedAt,
    })
  })
  return reminderView(reminderById(db, reminderId), caseRow)
}

export function scheduleReminder(db, reminderId, scheduleAt, context, now = new Date()) {
  const reminder = reminderById(db, reminderId)
  const caseRow = assertReminderAccess(db, reminder, context)
  if (context.role !== 'RM' || context.actor !== caseRow.rm_name || reminder.approved_by !== context.actor) {
    fail(403, 'Only the approving assigned RM can schedule this reminder.')
  }
  if (reminder.status !== 'APPROVED') fail(409, 'Approve the reminder before scheduling it.')
  const scheduledDate = new Date(scheduleAt)
  if (typeof scheduleAt !== 'string' || Number.isNaN(scheduledDate.valueOf())) {
    fail(400, 'Enter a valid scheduled delivery time.')
  }
  if (scheduledDate <= now || scheduledDate > new Date(now.valueOf() + 90 * DAY_MS)) {
    fail(400, 'Schedule the reminder for a future time within the next 90 days.')
  }

  inTransaction(db, () => {
    db.prepare(`
      UPDATE reminders SET status = 'SCHEDULED', schedule_at = ? WHERE id = ?
    `).run(scheduledDate.toISOString(), reminderId)
    addCaseEvent(db, {
      caseId: caseRow.id,
      reminderId,
      type: 'REMINDER_SCHEDULED',
      summary: `Approved reminder scheduled for ${scheduledDate.toISOString()}.`,
      actor: context.actor,
      occurredAt: now.toISOString(),
      metadata: { simulated: true },
    })
  })
  return reminderView(reminderById(db, reminderId), caseRow)
}

function recordSimulatedSend(db, reminder, now, actor) {
  const caseRow = caseById(db, reminder.case_id)
  const sentAt = now.toISOString()
  inTransaction(db, () => {
    db.prepare(`
      UPDATE reminders SET status = 'SENT', sent_at = ? WHERE id = ?
    `).run(sentAt, reminder.id)
    addCaseEvent(db, {
      caseId: caseRow.id,
      reminderId: reminder.id,
      type: 'REMINDER_SENT',
      summary: 'Simulated email delivery recorded in Northgate Chase; no email was transmitted.',
      actor,
      occurredAt: sentAt,
      metadata: { simulated: true, transmitted: false },
    })
  })
  return reminderView(reminderById(db, reminder.id), caseRow)
}

export function simulateReminderSend(db, reminderId, context, now = new Date()) {
  const reminder = reminderById(db, reminderId)
  const caseRow = assertReminderAccess(db, reminder, context)
  if (context.role !== 'RM' || context.actor !== caseRow.rm_name) {
    fail(403, 'Only the assigned RM who approved this reminder can simulate its delivery.')
  }
  if (reminder.status !== 'APPROVED' || reminder.approved_by !== context.actor) {
    fail(409, 'Approve the reminder before simulating delivery.')
  }
  return recordSimulatedSend(db, reminder, now, `${context.actor} (simulated)`)
}

export function runDueScheduledReminders(db, now = new Date()) {
  const dueReminders = db.prepare(`
    SELECT * FROM reminders
    WHERE status = 'SCHEDULED' AND approved_at IS NOT NULL AND schedule_at <= ?
    ORDER BY schedule_at
  `).all(now.toISOString())

  for (const reminder of dueReminders) {
    recordSimulatedSend(db, reminder, now, 'Northgate scheduler (simulated)')
  }
  return dueReminders.length
}

export function getAnalytics(db) {
  const stages = db.prepare(`
    SELECT stage, duration_days AS durationDays
    FROM stage_durations
    ORDER BY stage, duration_days
  `).all()
  const stageMap = new Map()
  for (const row of stages) {
    const values = stageMap.get(row.stage) ?? []
    values.push(row.durationDays)
    stageMap.set(row.stage, values)
  }

  const stageDurations = [...stageMap].map(([stage, values]) => ({
    stage,
    medianDays: median(values),
    casesMeasured: values.length,
  })).sort((a, b) => a.stage.localeCompare(b.stage))
  const roundCounts = db.prepare(`
    SELECT chase_round AS round, COUNT(*) AS documentCount
    FROM documents WHERE status = 'REQUESTED'
    GROUP BY chase_round ORDER BY chase_round
  `).all()
  const totalOutstanding = roundCounts.reduce((total, item) => total + item.documentCount, 0)
  const monthlyCases = db.prepare('SELECT COUNT(*) AS count FROM cases').get().count
  const escalatedCases = db.prepare(`
    SELECT COUNT(DISTINCT case_id) AS count FROM documents
    WHERE status = 'REQUESTED' AND chase_round >= 3
  `).get().count

  return {
    stageDurations,
    chaseRounds: [1, 2, 3].map((round) => {
      const documentCount = roundCounts.find((item) => item.round === round)?.documentCount ?? 0
      return {
        round,
        documentCount,
        percentage: totalOutstanding ? Math.round((documentCount / totalOutstanding) * 100) : 0,
      }
    }),
    monthlyIntake: monthlyCases,
    escalatedCases,
    medianChaseDays: stageMap.has('Chasing Missing Docs')
      ? median(stageMap.get('Chasing Missing Docs'))
      : 0,
  }
}

export function getHandoffs(db, caseId, context) {
  if (!['OPS', 'ANALYST', 'RM'].includes(context.role)) fail(403, 'This demo role cannot access analyst handoffs.')
  if (caseId) {
    const caseRow = caseById(db, caseId)
    assertCaseAccess(db, caseRow, context)
  }
  const rows = caseId
    ? db.prepare(`
      SELECT handoffs.*, cases.client_name AS clientName, cases.rm_name AS rmName,
        documents.name AS documentName
      FROM handoffs
      JOIN cases ON cases.id = handoffs.case_id
      JOIN documents ON documents.id = handoffs.document_id
      WHERE handoffs.case_id = ?
      ORDER BY handoffs.created_at DESC
    `).all(caseId)
    : context.role === 'ANALYST'
      ? db.prepare(`
        SELECT handoffs.*, cases.client_name AS clientName, cases.rm_name AS rmName,
          documents.name AS documentName
        FROM handoffs
        JOIN cases ON cases.id = handoffs.case_id
        JOIN documents ON documents.id = handoffs.document_id
        WHERE handoffs.analyst_name = ? OR handoffs.target_rm = ?
        ORDER BY handoffs.created_at DESC
      `).all(context.actor, context.actor)
      : db.prepare(`
        SELECT handoffs.*, cases.client_name AS clientName, cases.rm_name AS rmName,
          documents.name AS documentName
        FROM handoffs
        JOIN cases ON cases.id = handoffs.case_id
        JOIN documents ON documents.id = handoffs.document_id
        ORDER BY handoffs.created_at DESC
      `).all()

  return rows.map((item) => ({
    id: item.id,
    caseId: item.case_id,
    clientName: item.clientName,
    rmName: item.rmName,
    documentId: item.document_id,
    documentName: item.documentName,
    analystName: item.analyst_name,
    targetRM: item.target_rm,
    message: item.message,
    status: item.status,
    createdAt: item.created_at,
  }))
}

export function createHandoff(db, caseId, documentId, message, context, now = new Date()) {
  if (!['OPS', 'ANALYST'].includes(context.role)) {
    fail(403, 'Only a KYC Analyst or Ops Coordinator can raise a linked handoff.')
  }
  const caseRow = caseById(db, caseId)
  assertCaseAccess(db, caseRow, context)
  const document = documentById(db, documentId)
  if (!document || document.case_id !== caseId) fail(404, 'Blocked document not found in this case.')
  if (document.status !== 'REQUESTED') fail(409, 'A handoff must be linked to an outstanding document.')
  if (typeof message !== 'string' || message.trim().length < 10 || message.trim().length > 1000) {
    fail(400, 'Enter a handoff note between 10 and 1,000 characters.')
  }

  const handoffId = randomUUID()
  const createdAt = now.toISOString()
  const analystName = context.role === 'ANALYST' ? context.actor : 'Liam Chen'
  inTransaction(db, () => {
    db.prepare(`
      INSERT INTO handoffs (
        id, case_id, document_id, analyst_name, target_rm, message, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `).run(handoffId, caseId, documentId, analystName, caseRow.rm_name, message.trim(), createdAt)
    addCaseEvent(db, {
      caseId,
      documentId,
      type: 'ANALYST_HANDOFF_CREATED',
      summary: `Analyst handoff linked to ${document.name} and routed to ${caseRow.rm_name}.`,
      actor: analystName,
      occurredAt: createdAt,
      metadata: { handoffId, targetRM: caseRow.rm_name },
    })
  })
  return getHandoffs(db, caseId, context).find((handoff) => handoff.id === handoffId)
}

export function acknowledgeHandoff(db, handoffId, context, now = new Date()) {
  if (!['OPS', 'RM'].includes(context.role)) fail(403, 'Only Ops or the target RM can acknowledge this request.')
  const handoff = db.prepare('SELECT * FROM handoffs WHERE id = ?').get(handoffId)
  if (!handoff) fail(404, 'Linked request not found.')
  const caseRow = caseById(db, handoff.case_id)
  assertCaseAccess(db, caseRow, context)
  if (context.role === 'RM' && context.actor !== handoff.target_rm) {
    fail(403, 'Only the target RM can acknowledge this request.')
  }
  if (handoff.status !== 'OPEN') fail(409, 'Only an open linked request can be acknowledged.')

  const occurredAt = now.toISOString()
  inTransaction(db, () => {
    db.prepare("UPDATE handoffs SET status = 'ACKNOWLEDGED' WHERE id = ?").run(handoffId)
    addCaseEvent(db, {
      caseId: handoff.case_id,
      documentId: handoff.document_id,
      type: 'ANALYST_HANDOFF_ACKNOWLEDGED',
      summary: `Linked analyst request acknowledged by ${context.actor}.`,
      actor: context.actor,
      occurredAt,
      metadata: { handoffId },
    })
  })
  return { acknowledged: true }
}
