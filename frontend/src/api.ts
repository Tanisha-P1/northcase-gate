import type {
  AnalyticsData,
  AssistantResponse,
  BootstrapData,
  CaseDetails,
  DemoRole,
  Handoff,
  QueueData,
  ReminderDetails,
} from './types'

const defaultActors: Record<DemoRole, string> = {
  RM: 'Sarah Jenkins',
  OPS: 'Ops Coordinator',
  ANALYST: 'Liam Chen',
  COO: 'Morgan Ellis',
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const role = (localStorage.getItem('northgate-role') as DemoRole | null) ?? 'OPS'
  const actor = localStorage.getItem('northgate-actor') ?? defaultActors[role]
  const headers = new Headers(init.headers)
  headers.set('x-demo-role', role)
  headers.set('x-demo-actor', actor)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')

  const response = await fetch(path, { ...init, headers })
  const result = await response.json() as { error?: string } & T
  if (!response.ok) throw new ApiError(response.status, result.error ?? `Request failed (${response.status}).`)
  return result
}

export const api = {
  bootstrap: () => request<BootstrapData>('/api/bootstrap'),
  queue: (filters: URLSearchParams) => request<QueueData>(`/api/queue?${filters.toString()}`),
  caseDetails: (caseId: string) => request<CaseDetails>(`/api/cases/${encodeURIComponent(caseId)}`),
  receiveDocument: (caseId: string, documentId: string) => request<{ received: boolean }>(
    `/api/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/receive`,
    { method: 'POST' },
  ),
  waiveDocument: (caseId: string, documentId: string, reason: string) => request<{ waived: boolean }>(
    `/api/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/waive`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  ),
  createDraft: (caseId: string, documentIds: string[]) => request<{ reminder: { id: string } }>(
    `/api/cases/${encodeURIComponent(caseId)}/reminders`,
    { method: 'POST', body: JSON.stringify({ documentIds }) },
  ),
  reminder: (reminderId: string) => request<ReminderDetails>(
    `/api/reminders/${encodeURIComponent(reminderId)}`,
  ),
  updateDraft: (reminderId: string, input: { subject: string; body: string; dueAt: string }) => request(
    `/api/reminders/${encodeURIComponent(reminderId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  ),
  approveReminder: (reminderId: string) => request(
    `/api/reminders/${encodeURIComponent(reminderId)}/approve`,
    { method: 'POST' },
  ),
  scheduleReminder: (reminderId: string, scheduleAt: string) => request(
    `/api/reminders/${encodeURIComponent(reminderId)}/schedule`,
    { method: 'POST', body: JSON.stringify({ scheduleAt }) },
  ),
  simulateSend: (reminderId: string) => request(
    `/api/reminders/${encodeURIComponent(reminderId)}/send`,
    { method: 'POST' },
  ),
  analytics: () => request<AnalyticsData>('/api/analytics'),
  handoffs: (caseId?: string) => {
    const query = caseId ? `?caseId=${encodeURIComponent(caseId)}` : ''
    return request<{ handoffs: Handoff[] }>(`/api/handoffs${query}`)
  },
  createHandoff: (caseId: string, documentId: string, message: string) => request<{ handoff: Handoff }>(
    `/api/cases/${encodeURIComponent(caseId)}/handoffs`,
    { method: 'POST', body: JSON.stringify({ documentId, message }) },
  ),
  acknowledgeHandoff: (handoffId: string) => request<{ acknowledged: boolean }>(
    `/api/handoffs/${encodeURIComponent(handoffId)}/acknowledge`,
    { method: 'POST' },
  ),
  askAssistant: (question: string) => request<AssistantResponse>(
    '/api/assistant/ask',
    { method: 'POST', body: JSON.stringify({ question }) },
  ),
  saveAIAssistedDraft: (input: {
    caseId: string
    documentIds: string[]
    subject: string
    body: string
    dueAt: string
  }) => request<{ reminder: { id: string } }>(
    '/api/assistant/reminder-draft',
    { method: 'POST', body: JSON.stringify(input) },
  ),
}

export function getDemoContext() {
  const storedRole = localStorage.getItem('northgate-role') as DemoRole | null
  const role = storedRole && storedRole in defaultActors ? storedRole : 'OPS'
  return {
    role,
    actor: localStorage.getItem('northgate-actor') ?? defaultActors[role],
  }
}

export function setDemoContext(role: DemoRole, actor: string) {
  localStorage.setItem('northgate-role', role)
  localStorage.setItem('northgate-actor', actor)
}
