export type DemoRole = 'RM' | 'OPS' | 'ANALYST' | 'COO'

export type Status = 'ON_TRACK' | 'DUE_TODAY' | 'OVERDUE'

export interface DemoOption {
  role: DemoRole
  actor: string
  label: string
}

export interface BootstrapData {
  role: DemoRole
  actor: string
  roles: DemoOption[]
  relationshipManagers: string[]
  stages: string[]
  categories: string[]
  overdueAfterDays: number
}

export interface QueueCase {
  id: string
  clientName: string
  industry: string
  rmName: string
  daysOpen: number
  currentStage: string
  outstandingCount: number
  oldestOutstandingAge: number
  oldestOutstandingDocumentId: string | null
  oldestOutstandingDocumentName: string | null
  nextFollowUp: string | null
  status: Status
}

export interface QueueData {
  cases: QueueCase[]
  summary: {
    casesOpen: number
    casesOverdue: number
    medianDaysInChaseStage: number
  }
  filters: {
    relationshipManagers: string[]
    stages: string[]
  }
}

export interface CaseDocument {
  id: string
  name: string
  category: string
  status: string
  storedStatus: string
  owner: 'Client' | 'Internal'
  requestedAt: string
  chaseRound: number
  receivedAt: string | null
  waivedReason: string | null
  followUpDate: string | null
  ageDays: number
}

export interface CaseEvent {
  id: number
  documentId: string | null
  reminderId: string | null
  type: string
  summary: string
  actor: string
  occurredAt: string
  metadata: Record<string, unknown>
}

export interface Handoff {
  id: string
  caseId: string
  clientName: string
  rmName: string
  documentId: string
  documentName: string
  analystName: string
  targetRM: string
  message: string
  status: string
  createdAt: string
}

export interface CaseDetails {
  case: QueueCase
  client: {
    contactName: string
    contactEmail: string
  }
  documents: CaseDocument[]
  categories: string[]
  events: CaseEvent[]
  handoffs: Handoff[]
  overdueAfterDays: number
}

export interface Reminder {
  id: string
  caseId: string
  clientName: string
  rmName: string
  recipient: string
  subject: string
  body: string
  dueAt: string
  status: 'DRAFT' | 'APPROVED' | 'SCHEDULED' | 'SENT'
  createdBy: string
  createdAt: string
  approvedBy: string | null
  approvedAt: string | null
  scheduleAt: string | null
  sentAt: string | null
  simulated: boolean
}

export interface ReminderDetails {
  reminder: Reminder
  documents: Array<{
    id: string
    name: string
    status: string
    category: string
  }>
}

export interface AnalyticsData {
  stageDurations: Array<{
    stage: string
    medianDays: number
    casesMeasured: number
  }>
  chaseRounds: Array<{
    round: number
    documentCount: number
    percentage: number
  }>
  monthlyIntake: number
  escalatedCases: number
  medianChaseDays: number
}

export interface AssistantSource {
  caseId?: string
  documentId?: string
  label: string
  kind: string
}

export interface AssistantResponse {
  answer: string
  sources: AssistantSource[]
  model: string
  reminderDraft: {
    caseId: string
    documentIds: string[]
    dueAt: string
  } | null
}
