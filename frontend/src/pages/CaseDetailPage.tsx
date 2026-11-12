import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleAlert,
  FileCheck2,
  FileText,
  Forward,
  History,
  MailPlus,
  Shield,
  UserRound,
} from 'lucide-react'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/Feedback'
import { StatusBadge } from '../components/StatusBadge'
import { formatDate, formatDateTime } from '../utils'
import type { CaseDetails, CaseDocument, DemoRole } from '../types'

interface CaseDetailPageProps {
  role: DemoRole
  actor: string
}

export function CaseDetailPage({ role, actor }: CaseDetailPageProps) {
  const { caseId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [data, setData] = useState<CaseDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyDocumentId, setBusyDocumentId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    api.caseDetails(caseId).then((result) => {
      if (active) {
        setData(result)
        setError('')
      }
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Case details could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [caseId, role, actor, refreshKey])

  function retry() {
    setError('')
    setRefreshKey((key) => key + 1)
  }

  const selectedDocumentId = searchParams.get('document')
  useEffect(() => {
    if (!selectedDocumentId || loading || !data) return
    document.getElementById(`document-${selectedDocumentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [data, loading, selectedDocumentId])

  const groupedDocuments = useMemo(() => {
    if (!data) return []
    return data.categories
      .map((category) => ({
        category,
        documents: data.documents.filter((item) => item.category === category),
      }))
      .filter((group) => group.documents.length > 0)
  }, [data])

  async function composeReminder(documentIds: string[]) {
    setError('')
    try {
      const { reminder } = await api.createDraft(caseId, documentIds)
      navigate(`/reminders/${encodeURIComponent(reminder.id)}`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Reminder draft could not be created.')
    }
  }

  async function receiveDocument(item: CaseDocument) {
    setBusyDocumentId(item.id)
    setError('')
    try {
      await api.receiveDocument(caseId, item.id)
      setNotice(`${item.name} marked as received. The case timeline was updated.`)
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Document status could not be updated.')
    } finally {
      setBusyDocumentId('')
    }
  }

  async function waiveDocument(item: CaseDocument) {
    const reason = window.prompt(`Why is “${item.name}” not required? A waiver reason is recorded in the timeline.`)
    if (reason === null) return
    setBusyDocumentId(item.id)
    setError('')
    try {
      await api.waiveDocument(caseId, item.id, reason)
      setNotice(`${item.name} waived with a recorded reason.`)
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Document waiver could not be saved.')
    } finally {
      setBusyDocumentId('')
    }
  }

  if (loading && !data) return <LoadingState label="Loading case detail" />
  if (error && !data) return <ErrorState message={error} onRetry={retry} />
  if (!data) return <ErrorState message="Case data was not returned by the API." />

  const outstanding = data.documents.filter((item) => item.storedStatus === 'REQUESTED')
  const blockedDocuments = outstanding.filter((item) =>
    item.category === 'Ownership and UBO' || item.category === 'Registry Extracts')
  const canWrite = role === 'OPS' || (role === 'RM' && actor === data.case.rmName)

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link className="back-link" to="/queue"><ArrowLeft size={16} /> Back to queue</Link>
        <span className="breadcrumb-separator">/</span>
        <span className="case-id">{data.case.id}</span>
        <span className="breadcrumb-separator">/</span>
        <span>{data.case.clientName}</span>
      </div>

      <section className="case-hero panel">
        <div className="case-hero-main">
          <div className="eyebrow">Corporate onboarding case</div>
          <div className="case-title-row">
            <h1>{data.case.clientName}</h1>
            <StatusBadge status={data.case.status} />
          </div>
          <div className="case-meta-row">
            <span>Case ID <strong className="case-id">{data.case.id}</strong></span>
            <span>{data.case.industry}</span>
            <span><UserRound size={14} /> RM: <strong>{data.case.rmName}</strong></span>
            <span><CalendarDays size={14} /> Open {data.case.daysOpen} days</span>
          </div>
        </div>
        <div className="case-hero-actions">
          <button
            className="button button-primary"
            disabled={!outstanding.length || busyDocumentId !== ''}
            onClick={() => void composeReminder(outstanding.map((item) => item.id))}
          >
            <MailPlus size={16} /> Chase all ({outstanding.length})
          </button>
          <div className="privacy-inline"><Shield size={15} /> Reminders are never sent without RM approval</div>
        </div>
      </section>

      {notice && <div className="notice-banner" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
      {error && <ErrorState message={error} onRetry={retry} />}

      <div className="case-layout">
        <section className="panel document-panel">
          <div className="panel-heading">
            <div>
              <div className="panel-kicker">Client file</div>
              <h2>Document checklist</h2>
            </div>
            <span className="completion-count">{data.documents.filter((item) => item.storedStatus !== 'REQUESTED').length} of {data.documents.length} resolved</span>
          </div>
          <div className="checklist-legend">
            <span><span className="legend-dot green-dot" />Complete</span>
            <span><span className="legend-dot amber-dot" />Requested</span>
            <span><span className="legend-dot red-dot" />Overdue</span>
          </div>
          <div className="document-groups">
            {groupedDocuments.map((group) => (
              <div className="document-group" key={group.category}>
                <div className="document-group-heading">
                  <h3>{group.category}</h3>
                  <span>{group.documents.filter((item) => item.storedStatus !== 'REQUESTED').length} / {group.documents.length} complete</span>
                </div>
                {group.documents.map((item) => (
                  <article
                    className={`document-row ${item.status === 'OVERDUE' ? 'document-overdue' : ''} ${item.id === selectedDocumentId ? 'document-selected' : ''}`}
                    id={`document-${item.id}`}
                    key={item.id}
                  >
                    <div className="document-row-main">
                      <div className={`document-mark mark-${item.status.toLowerCase().replaceAll('_', '-')}`}>
                        {item.storedStatus === 'RECEIVED' ? <FileCheck2 size={17} /> : <FileText size={17} />}
                      </div>
                      <div className="document-title-block">
                        <div className="document-name">{item.name}</div>
                        <div className="document-meta">
                          <span>Owner: <strong>{item.owner}</strong></span>
                          <span>Requested: {formatDate(item.requestedAt)}</span>
                          <span>Chase round {item.chaseRound} of 3</span>
                        </div>
                        {item.waivedReason && <div className="waiver-reason">Reason: {item.waivedReason}</div>}
                      </div>
                      <div className="document-status-column">
                        <StatusBadge status={item.status} />
                        {item.followUpDate && <span className="document-deadline">Follow-up {formatDate(item.followUpDate)}</span>}
                      </div>
                    </div>
                    {item.storedStatus === 'REQUESTED' && (
                      <div className="document-actions">
                        <button className="button button-primary button-small" disabled={busyDocumentId === item.id} onClick={() => void composeReminder([item.id])}>
                          <MailPlus size={14} /> Draft reminder
                        </button>
                        {canWrite && (
                          <>
                            <button className="button button-secondary button-small" disabled={busyDocumentId === item.id} onClick={() => void receiveDocument(item)}>
                              <Check size={14} /> Mark received
                            </button>
                            <button className="button button-quiet button-small" disabled={busyDocumentId === item.id} onClick={() => void waiveDocument(item)}>
                              Waive
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>

        <aside className="case-side-column">
          <section className={`panel blocked-panel ${blockedDocuments.length ? 'blocked-panel-active' : ''}`}>
            <div className="blocked-heading">
              <div className="panel-kicker">Downstream context</div>
              <span className={`stage-indicator ${blockedDocuments.length ? 'stage-indicator-blocked' : ''}`}>
                {blockedDocuments.length ? 'Waiting on documents' : 'No linked blocker'}
              </span>
            </div>
            <h2><CircleAlert size={18} /> Ownership analysis handoff</h2>
            {blockedDocuments.length ? (
              <>
                <p className="blocked-copy">A KYC Analyst may be waiting on these ownership or registry items before starting manual analysis.</p>
                <div className="blocked-document-list">
                  {blockedDocuments.map((item) => (
                    <div className="blocked-document" key={item.id}>
                      <FileText size={15} />
                      <span>{item.name}</span>
                      <StatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
                <Link className="button button-secondary handoff-link" to={`/handoff/${encodeURIComponent(caseId)}?document=${encodeURIComponent(blockedDocuments[0].id)}`}>
                  <Forward size={15} /> Open analyst handoff <ArrowUpRight size={14} />
                </Link>
              </>
            ) : (
              <p className="blocked-copy">No outstanding ownership or registry document is currently linked to a downstream handoff.</p>
            )}
          </section>

          <section className="panel contact-panel">
            <div className="panel-kicker">Synthetic client contact</div>
            <h2>{data.client.contactName}</h2>
            <p>{data.client.contactEmail}</p>
            <span className="example-note">Reserved .example address · no email is transmitted</span>
          </section>

          {data.handoffs.length > 0 && (
            <section className="panel">
              <div className="panel-heading compact-heading">
                <h2>Linked analyst requests</h2>
                <span className="small-count">{data.handoffs.length}</span>
              </div>
              {data.handoffs.map((handoff) => (
                <Link className="linked-handoff" key={handoff.id} to={`/handoff/${encodeURIComponent(caseId)}?document=${encodeURIComponent(handoff.documentId)}`}>
                  <span>{handoff.documentName}</span><StatusBadge status={handoff.status} />
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>

      <section className="panel timeline-panel" id="timeline">
        <div className="panel-heading">
          <div>
            <div className="panel-kicker">Immutable case event log</div>
            <h2><History size={19} /> Chase timeline</h2>
          </div>
          <span className="table-secondary">Latest {Math.min(data.events.length, 100)} events</span>
        </div>
        {data.events.length ? (
          <ol className="timeline-list">
            {data.events.map((event) => (
              <li className="timeline-item" key={event.id}>
                <span className={`timeline-marker timeline-${event.type.toLowerCase().replaceAll('_', '-')}`} />
                <div className="timeline-content">
                  <div className="timeline-event-heading">
                    <strong>{event.summary}</strong>
                    {event.reminderId && <Link to={`/reminders/${encodeURIComponent(event.reminderId)}`}>Open reminder <ArrowUpRight size={13} /></Link>}
                  </div>
                  <div className="timeline-meta">
                    <span>{formatDateTime(event.occurredAt)}</span>
                    <span>Actor: {event.actor}</span>
                    {event.documentId && <span className="case-id">{event.documentId}</span>}
                    {event.metadata.simulated === true && <span className="simulation-tag">Simulated only</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="empty-copy">No case events have been recorded.</p>}
      </section>
    </div>
  )
}
