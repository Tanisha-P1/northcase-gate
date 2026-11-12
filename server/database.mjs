import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(serverDirectory, 'migrations', '001_initial.sql')

export const RELATIONSHIP_MANAGERS = [
  'Sarah Jenkins',
  'Marcus Vance',
  'Elena Rostova',
  'David Kim',
]

export const CASE_STAGES = [
  'Document Intake',
  'Chasing Missing Docs',
  'Ownership and UBO',
  'Compliance Review',
  'Account Setup',
]

export const DOCUMENT_CATEGORIES = [
  'Constitutional Documents',
  'Ownership and UBO',
  'Registry Extracts',
  'Authorised Signatories',
  'Other',
]

const clients = [
  ['Meridian Horizon Shipping Ltd', 'Maritime logistics'],
  ['Aegis Capital Logistics Corp', 'Cross-border logistics'],
  ['Solas Energy Infrastructure SA', 'Renewable energy'],
  ['Vanguard Biometrix Global Plc', 'Medical technology'],
  ['Northstar Industrial Components GmbH', 'Industrial manufacturing'],
  ['Cedar Ridge Renewable Holdings Ltd', 'Renewable infrastructure'],
  ['Atlas Meridian Trading Pte Ltd', 'Commodity trading'],
  ['Bluehaven Maritime Services BV', 'Marine services'],
  ['Silverline Data Systems Inc', 'Enterprise technology'],
  ['Orion Fields Agricultural Group SA', 'Agriculture'],
  ['Pinecrest Medical Devices Ltd', 'Medical devices'],
  ['Redwood Strategic Materials GmbH', 'Materials distribution'],
]

const contacts = [
  'Jordan Lee',
  'Avery Morgan',
  'Riley Chen',
  'Taylor Brooks',
  'Casey Patel',
  'Quinn Davis',
  'Morgan Reed',
  'Jamie Singh',
  'Cameron Bell',
  'Alex Rivera',
  'Drew Parker',
  'Skylar Bennett',
]

const documents = [
  ['Certificate of Incorporation', 'Constitutional Documents'],
  ['Articles of Association', 'Constitutional Documents'],
  ['Certified Group Organisation Chart', 'Ownership and UBO'],
  ['Shareholder Register Extract', 'Registry Extracts'],
  ['Authorised Signatory Specimen', 'Authorised Signatories'],
  ['Tax Residency Certificate', 'Other'],
  ['Current Company Registry Extract', 'Registry Extracts'],
]

const caseAges = [48, 42, 38, 34, 31, 28, 25, 22, 18, 14, 9, 5]
const stageDurations = {
  'Document Intake': [7, 9, 8, 11, 6, 10, 8, 9, 7, 6, 5, 4],
  'Chasing Missing Docs': [11, 14, 17, 19, 24, 16, 21, 13, 18, 12, 8, 5],
  'Ownership and UBO': [8, 13, 11, 18, 16, 12, 20, 9, 15, 10, 7, 4],
  'Compliance Review': [5, 7, 9, 6, 11, 8, 10, 7, 6, 5, 4, 3],
  'Account Setup': [4, 5, 6, 7, 5, 8, 6, 5, 4, 4, 3, 2],
}

export function isoDaysAgo(now, days) {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() - days)
  date.setUTCHours(9, 0, 0, 0)
  return date.toISOString()
}

function isoDaysAfter(value, days) {
  const date = new Date(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function insertEvent(db, {
  caseId,
  documentId = null,
  reminderId = null,
  type,
  summary,
  actor,
  occurredAt,
  metadata = {},
}) {
  db.prepare(`
    INSERT INTO events (case_id, document_id, reminder_id, event_type, summary, actor, occurred_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(caseId, documentId, reminderId, type, summary, actor, occurredAt, JSON.stringify(metadata))
}

function seedSyntheticData(db, now) {
  if (db.prepare('SELECT COUNT(*) AS count FROM cases').get().count > 0) return

  const insertCase = db.prepare(`
    INSERT INTO cases (
      id, client_name, industry, rm_name, days_open, current_stage,
      contact_name, contact_email, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertDocument = db.prepare(`
    INSERT INTO documents (
      id, case_id, name, category, status, owner, requested_at, chase_round, received_at, waived_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertStageDuration = db.prepare(`
    INSERT INTO stage_durations (case_id, stage, duration_days, completed_at)
    VALUES (?, ?, ?, ?)
  `)

  clients.forEach(([clientName, industry], caseIndex) => {
    const suffix = 8101 + caseIndex
    const caseId = `NG-2026-${suffix}`
    const daysOpen = caseAges[caseIndex]
    const rmName = RELATIONSHIP_MANAGERS[caseIndex % RELATIONSHIP_MANAGERS.length]
    const currentStage = CASE_STAGES[(caseIndex * 3) % CASE_STAGES.length]
    const createdAt = isoDaysAgo(now, daysOpen)

    insertCase.run(
      caseId,
      clientName,
      industry,
      rmName,
      daysOpen,
      currentStage,
      contacts[caseIndex],
      `contact+${suffix}@client.example`,
      createdAt,
      new Date(now).toISOString(),
    )

    documents.forEach(([name, category], documentIndex) => {
      const documentId = `DOC-${suffix}-${documentIndex + 1}`
      const requestedAge = Math.max(
        1,
        Math.min(daysOpen - 1, 4 + ((caseIndex * 7 + documentIndex * 9) % 30)),
      )
      const requestedAt = isoDaysAgo(now, requestedAge)
      const waived = documentIndex === 5 && caseIndex % 4 === 0
      const received = !waived && (documentIndex === 0 || (caseIndex + documentIndex) % 4 === 0)
      const status = waived ? 'WAIVED' : received ? 'RECEIVED' : 'REQUESTED'
      const round = Math.min(3, Math.max(1, Math.floor(requestedAge / 7) + 1))
      const receivedAt = received ? isoDaysAgo(now, Math.max(0, requestedAge - 2)) : null
      const waivedReason = waived ? 'Synthetic demo waiver recorded by an Ops coordinator.' : null

      insertDocument.run(
        documentId,
        caseId,
        name,
        category,
        status,
        documentIndex === 4 ? 'Internal' : 'Client',
        requestedAt,
        round,
        receivedAt,
        waivedReason,
      )

      insertEvent(db, {
        caseId,
        documentId,
        type: 'DOCUMENT_REQUESTED',
        summary: `${name} requested from the client.`,
        actor: rmName,
        occurredAt: requestedAt,
        metadata: { synthetic: true },
      })

      if (receivedAt) {
        insertEvent(db, {
          caseId,
          documentId,
          type: 'DOCUMENT_RECEIVED',
          summary: `${name} marked as received.`,
          actor: 'Ops Coordinator',
          occurredAt: receivedAt,
          metadata: { synthetic: true },
        })
      } else if (waived) {
        insertEvent(db, {
          caseId,
          documentId,
          type: 'DOCUMENT_WAIVED',
          summary: `${name} waived: ${waivedReason}`,
          actor: 'Ops Coordinator',
          occurredAt: new Date(now).toISOString(),
          metadata: { reason: waivedReason, synthetic: true },
        })
      } else if (requestedAge > 15 && (caseIndex + documentIndex) % 3 === 0) {
        const priorRounds = Math.min(2, round - 1)
        for (let reminderRound = 1; reminderRound <= priorRounds; reminderRound += 1) {
          const sentAt = isoDaysAgo(now, Math.max(0, requestedAge - reminderRound * 7))
          insertEvent(db, {
            caseId,
            documentId,
            type: 'REMINDER_SENT',
            summary: `Synthetic historical reminder round ${reminderRound} sent (demo record only).`,
            actor: rmName,
            occurredAt: sentAt,
            metadata: { simulated: true, historical: true, round: reminderRound },
          })
        }
      }
    })

    for (const stage of CASE_STAGES) {
      insertStageDuration.run(
        caseId,
        stage,
        stageDurations[stage][caseIndex],
        createdAt,
      )
    }
  })

  const handoffId = randomUUID()
  const handoffAt = isoDaysAgo(now, 2)
  const handoffMessage = 'Ownership analysis is waiting on the certified organisation chart. Please coordinate the client follow-up through the RM.'
  db.prepare(`
    INSERT INTO handoffs (id, case_id, document_id, analyst_name, target_rm, message, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)
  `).run(
    handoffId,
    'NG-2026-8101',
    'DOC-8101-3',
    'Liam Chen',
    'Sarah Jenkins',
    handoffMessage,
    handoffAt,
  )
  insertEvent(db, {
    caseId: 'NG-2026-8101',
    documentId: 'DOC-8101-3',
    type: 'ANALYST_HANDOFF_CREATED',
    summary: 'Analyst Liam Chen raised a linked request with the RM.',
    actor: 'Liam Chen',
    occurredAt: handoffAt,
    metadata: { handoffId, targetRM: 'Sarah Jenkins', synthetic: true },
  })
}

export function createDatabase(databasePath = ':memory:', now = new Date()) {
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA foreign_keys = ON;')
  const version = db.prepare('PRAGMA user_version').get().user_version
  if (version < 1) db.exec(readFileSync(migrationPath, 'utf8'))
  seedSyntheticData(db, now)
  return db
}

export function addCaseEvent(db, event) {
  insertEvent(db, event)
}

export function dateAfter(value, days) {
  return isoDaysAfter(value, days)
}
