import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  FileWarning,
  Forward,
  MessageSquareText,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/Feedback'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime } from '../utils'
import type { CaseDetails, DemoRole, Handoff } from '../types'

interface HandoffPageProps {
  role: DemoRole
  actor: string
}

export function HandoffPage({ role, actor }: HandoffPageProps) {
  const { caseId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const requestedDocumentId = searchParams.get('document') ?? ''
  const [caseDetails, setCaseDetails] = useState<CaseDetails | null>(null)
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState(requestedDocumentId)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    const load = caseId
      ? Promise.all([api.caseDetails(caseId), api.handoffs(caseId)]).then(([caseResult, handoffResult]) => {
        if (!active) return
        setCaseDetails(caseResult)
        setHandoffs(handoffResult.handoffs)
        setSelectedDocumentId(requestedDocumentId || handoffResult.handoffs[0]?.documentId || '')
        setMessage(`Please coordinate follow-up for ${caseResult.documents.find((item) => item.id === requestedDocumentId)?.name ?? 'the outstanding ownership document'} and update the case when the client responds.`)
      })
      : api.handoffs().then((result) => {
        if (!active) return
        setHandoffs(result.handoffs)
        setCaseDetails(null)
      })

    load.then(() => {
      if (active) setError('')
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Analyst handoff could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [caseId, role, actor, requestedDocumentId, refreshKey])

  function retry() {
    setError('')
    setRefreshKey((key) => key + 1)
  }

  const outstandingDocuments = useMemo(
    () => caseDetails?.documents.filter((item) => item.storedStatus === 'REQUESTED') ?? [],
    [caseDetails],
  )
  const selectedDocument = outstandingDocuments.find((item) => item.id === selectedDocumentId)
  const canCreate = role === 'OPS' || role === 'ANALYST'
  const canAcknowledge = role === 'OPS' || (role === 'RM' && actor === caseDetails?.case.rmName)

  async function sendHandoff() {
    if (!caseDetails || !selectedDocument) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.createHandoff(caseDetails.case.id, selectedDocument.id, message)
      setNotice('Linked request sent to the assigned RM and recorded in the case timeline.')
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Linked request could not be created.')
    } finally {
      setBusy(false)
    }
  }

  async function acknowledge(handoff: Handoff) {
    setBusy(true)
    setError('')
    try {
      await api.acknowledgeHandoff(handoff.id)
      setNotice('Linked request acknowledged. The action was added to the case timeline.')
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Linked request could not be acknowledged.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !caseDetails && !handoffs.length) return <LoadingState label="Loading analyst handoff" />
  if (error && !caseDetails && !handoffs.length) return <ErrorState message={error} onRetry={retry} />
  if (!caseId) {
    return (
      <div className="page-stack">
        <div className="page-heading">
          <div><div className="eyebrow"><Forward size={14} /> KYC analyst workspace</div><h1>Analyst Handoff</h1><p>Review document-linked requests and return to the RM with full case context.</p></div>
        </div>
        {error && <ErrorState message={error} onRetry={retry} />}
        <section className="panel handoff-list-panel">
          <div className="panel-heading"><div><div className="panel-kicker">Linked requests</div><h2>Open analyst handoffs</h2></div><span className="small-count">{handoffs.filter((item) => item.status === 'OPEN').length} open</span></div>
          {handoffs.length ? (
            <div className="handoff-list">
              {handoffs.map((handoff) => (
                <Link className="handoff-list-row" key={handoff.id} to={`/handoff/${encodeURIComponent(handoff.caseId)}?document=${encodeURIComponent(handoff.documentId)}`}>
                  <span className="handoff-list-icon"><FileWarning size={18} /></span>
                  <span className="handoff-list-main"><strong>{handoff.clientName}</strong><small>{handoff.caseId} · {handoff.documentName}</small></span>
                  <span className="handoff-list-rm"><UserRound size={14} /> {handoff.targetRM}</span>
                  <StatusBadge status={handoff.status} />
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          ) : <p className="empty-copy">No linked requests are waiting for review.</p>}
        </section>
      </div>
    )
  }

  if (loading && !caseDetails) return <LoadingState label="Loading blocked case context" />
  if (error && !caseDetails) return <ErrorState message={error} onRetry={retry} />
  if (!caseDetails) return <ErrorState message="Case context was not returned by the API." />

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <button className="back-link back-button" onClick={() => navigate('/handoff')}><ArrowLeft size={16} /> All handoffs</button>
        <span className="breadcrumb-separator">/</span>
        <span className="case-id">{caseDetails.case.id}</span>
        <span className="breadcrumb-separator">/</span>
        <span>{caseDetails.case.clientName}</span>
      </div>
      <div className="page-heading">
        <div><div className="eyebrow"><FileWarning size={14} /> Stage blocker · Manual review only</div><h1>Analyst Handoff</h1><p>Connect an outstanding document request to the assigned RM with a clear, auditable reason.</p></div>
      </div>
      {notice && <div className="notice-banner" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
      {error && <ErrorState message={error} onRetry={retry} />}

      <section className="handoff-context panel">
        <div><span className="panel-kicker">Client / case context</span><strong>{caseDetails.case.clientName}</strong><span className="case-id">{caseDetails.case.id}</span></div>
        <div><span className="panel-kicker">Originating analyst</span><strong>{role === 'ANALYST' ? actor : 'Liam Chen'}</strong><span>Corporate KYC Analyst</span></div>
        <div><span className="panel-kicker">Assigned Relationship Manager</span><strong><UserRound size={15} /> {caseDetails.case.rmName}</strong><span>Current stage: {caseDetails.case.currentStage}</span></div>
      </section>

      <div className="handoff-layout">
        <section className="panel handoff-form-panel">
          <div className="panel-heading">
            <div><div className="panel-kicker">Document evidence blocker</div><h2><FileWarning size={19} /> Outstanding document context</h2></div>
            <span className="stage-indicator stage-indicator-blocked">Manual follow-up</span>
          </div>
          {outstandingDocuments.length ? (
            <>
              <label className="form-field">
                <span>Blocked document</span>
                <select value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)} aria-label="Select blocked document">
                  {outstandingDocuments.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.category}</option>)}
                </select>
              </label>
              {selectedDocument && (
                <div className="handoff-document-card">
                  <div><FileWarning size={17} /><strong>{selectedDocument.name}</strong><StatusBadge status={selectedDocument.status} /></div>
                  <p>{selectedDocument.category} · Owner: {selectedDocument.owner} · Requested {selectedDocument.ageDays} days ago · Chase round {selectedDocument.chaseRound}</p>
                  <small>Missing-document context only. No UBO, KYC, sanctions, or credit decision is generated.</small>
                </div>
              )}
              <label className="form-field">
                <span>Analyst note to the RM</span>
                <textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} placeholder="Explain what is missing and why the downstream manual review is waiting." />
                <small>{message.length}/1,000 characters · This note is recorded in the immutable case timeline.</small>
              </label>
              <div className="handoff-form-actions">
                {canCreate ? (
                  <button className="button button-primary" disabled={busy || !selectedDocument || message.trim().length < 10} onClick={() => void sendHandoff()}>
                    <Forward size={16} /> {busy ? 'Recording request…' : 'Send linked request to RM'}
                  </button>
                ) : <span className="approval-hint"><ShieldCheck size={15} /> Switch to Ops or an Analyst role to raise a request.</span>}
              </div>
            </>
          ) : <p className="empty-copy">There are no outstanding documents to link to a new analyst request.</p>}
        </section>

        <aside className="panel handoff-existing-panel">
          <div className="panel-heading"><div><div className="panel-kicker">Case-linked audit</div><h2><MessageSquareText size={18} /> Existing requests</h2></div><span className="small-count">{handoffs.length}</span></div>
          {handoffs.length ? (
            <div className="existing-handoff-list">
              {handoffs.map((handoff) => (
                <article className="existing-handoff" key={handoff.id}>
                  <div className="existing-handoff-head"><strong>{handoff.documentName}</strong><StatusBadge status={handoff.status} /></div>
                  <p>{handoff.message}</p>
                  <div className="timeline-meta"><span>{handoff.analystName}</span><span>{formatDateTime(handoff.createdAt)}</span></div>
                  {handoff.status === 'OPEN' && canAcknowledge && (
                    <button className="button button-secondary button-small" disabled={busy} onClick={() => void acknowledge(handoff)}>
                      <Check size={14} /> Acknowledge request
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : <p className="empty-copy">No linked requests have been raised for this case.</p>}
          <div className="handoff-audit-note"><ShieldCheck size={15} /> Every linked request is attached to {caseDetails.case.id} and visible in the case timeline.</div>
        </aside>
      </div>
    </div>
  )
}
