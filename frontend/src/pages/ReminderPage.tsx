import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Clock3,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/Feedback'
import { StatusBadge } from '../components/StatusBadge'
import { formatDate, formatDateTime } from '../utils'
import type { DemoRole, ReminderDetails } from '../types'

interface ReminderPageProps {
  role: DemoRole
  actor: string
}

function localDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function ReminderPage({ role, actor }: ReminderPageProps) {
  const { reminderId = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<ReminderDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [scheduleAt, setScheduleAt] = useState(() => localDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)))
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    api.reminder(reminderId).then((result) => {
      if (active) {
        setData(result)
        setSubject(result.reminder.subject)
        setBody(result.reminder.body)
        setDueAt(result.reminder.dueAt)
        setError('')
      }
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Reminder draft could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [reminderId, role, actor, refreshKey])

  function retry() {
    setError('')
    setRefreshKey((key) => key + 1)
  }

  const reminder = data?.reminder
  const assignedRM = Boolean(reminder && role === 'RM' && actor === reminder.rmName)
  const editable = Boolean(reminder && ['DRAFT'].includes(reminder.status) && (
    role === 'OPS' || assignedRM
  ))
  const dueLocal = useMemo(() => formatDate(dueAt), [dueAt])

  async function saveDraft() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.updateDraft(reminderId, { subject, body, dueAt })
      setNotice('Draft changes saved. RM approval is still required.')
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Draft changes could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function approveDraft() {
    if (!window.confirm('Approve this exact reminder for the synthetic client contact? This records your explicit RM approval; no email is sent.')) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.approveReminder(reminderId)
      setNotice('Reminder approved by the assigned RM. It is not sent until you separately simulate delivery or schedule it.')
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Reminder approval could not be recorded.')
    } finally {
      setSaving(false)
    }
  }

  async function scheduleDelivery() {
    if (!scheduleAt || !window.confirm(`Schedule the approved reminder for ${new Date(scheduleAt).toLocaleString()}? Delivery remains simulated and no email will be transmitted.`)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.scheduleReminder(reminderId, new Date(scheduleAt).toISOString())
      setNotice('Approved reminder scheduled. The local scheduler will record a simulated delivery at that time.')
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Reminder could not be scheduled.')
    } finally {
      setSaving(false)
    }
  }

  async function simulateDelivery() {
    if (!window.confirm('Simulate email delivery now? The action only adds an audit event; no message leaves this application.')) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.simulateSend(reminderId)
      setNotice('Simulated delivery recorded. No real email was sent.')
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Delivery simulation could not be recorded.')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) return <LoadingState label="Loading reminder draft" />
  if (error && !data) return <ErrorState message={error} onRetry={retry} />
  if (!data || !reminder) return <ErrorState message="Reminder data was not returned by the API." />

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <button className="back-link back-button" onClick={() => navigate(`/cases/${encodeURIComponent(reminder.caseId)}`)}>
          <ArrowLeft size={16} /> Back to case
        </button>
        <span className="breadcrumb-separator">/</span>
        <span className="case-id">{reminder.caseId}</span>
        <span className="breadcrumb-separator">/</span>
        <span>Reminder composer</span>
      </div>

      <div className="page-heading reminder-page-heading">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> Template-based client communication</div>
          <h1>Reminder Composer</h1>
          <p>Review and edit the draft. Only the assigned RM can approve; delivery is always simulated.</p>
        </div>
        <StatusBadge status={reminder.status} />
      </div>

      <div className="approval-banner">
        <span className="approval-shield"><ShieldCheck size={20} /></span>
        <div>
          <strong>{reminder.status === 'DRAFT' ? 'Not approved · Not sent' : reminder.status === 'SENT' ? 'Simulated delivery complete' : 'Approval is recorded'}</strong>
          <p>
            {reminder.status === 'DRAFT'
              ? 'Edits are saved as a draft. No message can be sent or scheduled until the assigned RM approves it.'
              : reminder.status === 'SENT'
                ? 'This event is simulation-only. No email was transmitted to the .example address.'
                : 'No external email service is connected. Every delivery action is recorded in this case timeline.'}
          </p>
        </div>
        <span className="draft-reference">{reminder.id.slice(0, 16)}</span>
      </div>

      {notice && <div className="notice-banner" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
      {error && <ErrorState message={error} onRetry={retry} />}

      <section className="panel composer-panel">
        <div className="composer-envelope">
          <div className="composer-field">
            <label htmlFor="recipient">To</label>
            <div className="recipient-chip"><Mail size={15} />{reminder.recipient}<span>· synthetic contact</span></div>
          </div>
          <div className="composer-field">
            <label htmlFor="subject">Subject</label>
            <input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} disabled={!editable} maxLength={200} />
          </div>
        </div>

        <div className="draft-context">
          <div><span>Client</span><strong>{reminder.clientName}</strong></div>
          <div><span>Case</span><strong className="case-id">{reminder.caseId}</strong></div>
          <div><span>Relationship manager</span><strong>{reminder.rmName}</strong></div>
          <div><span>Requested by</span><strong>{reminder.createdBy}</strong></div>
        </div>

        {data.documents.length > 0 && (
          <div className="included-documents">
            <div className="included-heading">Documents included in this draft</div>
            <ul>
              {data.documents.map((item) => <li key={item.id}><FileClockIcon />{item.name}<StatusBadge status={item.status} /></li>)}
            </ul>
          </div>
        )}

        <div className="email-preview">
          <div className="email-preview-head">
            <div><span className="bank-mark">N</span><div><strong>Northgate Corporate Onboarding</strong><small>Template preview · Synthetic content</small></div></div>
            <span className="preview-label">CLIENT PREVIEW</span>
          </div>
          <label htmlFor="message-body" className="visually-hidden">Reminder message</label>
          <textarea
            id="message-body"
            className="email-body-editor"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!editable}
            maxLength={6000}
            rows={Math.min(16, Math.max(9, body.split('\n').length + 1))}
          />
          <div className="due-date-field">
            <label htmlFor="due-date"><CalendarClock size={16} /> Requested submission date</label>
            <input id="due-date" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} disabled={!editable} />
            <span className="table-secondary">Current due date: {dueLocal}</span>
          </div>
          <div className="example-note large-example-note">Preview only · Reserved .example address · No external mail integration</div>
        </div>

        <div className="approval-details">
          {reminder.approvedBy ? (
            <span><Check size={16} /> Explicitly approved by <strong>{reminder.approvedBy}</strong> on {formatDateTime(reminder.approvedAt ?? '')}</span>
          ) : (
            <span><ShieldCheck size={16} /> Pending explicit approval from <strong>{reminder.rmName}</strong></span>
          )}
          {reminder.scheduleAt && <span><Clock3 size={16} /> Scheduled for {formatDateTime(reminder.scheduleAt)}</span>}
          {reminder.sentAt && <span><Send size={16} /> Simulation recorded {formatDateTime(reminder.sentAt)}</span>}
        </div>

        <div className="composer-actions">
          {editable && <button className="button button-secondary" disabled={saving} onClick={() => void saveDraft()}>Save draft</button>}
          {reminder.status === 'DRAFT' && (
            <button className="button button-primary" disabled={saving || !assignedRM} onClick={() => void approveDraft()}>
              <ShieldCheck size={16} /> {saving ? 'Saving…' : assignedRM ? 'Approve reminder' : 'Assigned RM approval required'}
            </button>
          )}
          {reminder.status === 'APPROVED' && assignedRM && (
            <>
              <div className="schedule-control">
                <label htmlFor="schedule-at"><Clock3 size={15} /> Schedule</label>
                <input id="schedule-at" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
                <button className="button button-secondary" disabled={saving || !scheduleAt} onClick={() => void scheduleDelivery()}>Approve already recorded · Schedule</button>
              </div>
              <button className="button button-primary" disabled={saving} onClick={() => void simulateDelivery()}>
                <Send size={16} /> {saving ? 'Recording…' : 'Simulate email now'}
              </button>
            </>
          )}
          {reminder.status === 'SCHEDULED' && <span className="scheduled-state"><Clock3 size={16} /> Approved; waiting for scheduled simulation</span>}
          {reminder.status === 'SENT' && <span className="sent-state"><Check size={16} /> Simulation recorded · nothing transmitted</span>}
        </div>
      </section>
    </div>
  )
}

function FileClockIcon() {
  return <CalendarClock size={15} aria-hidden="true" />
}
