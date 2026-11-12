import { useEffect, useState } from 'react'
import { ArrowDownWideNarrow, ArrowUpRight, CalendarClock, FileClock, Filter, Search, Send, TimerReset } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/Feedback'
import { StatusBadge } from '../components/StatusBadge'
import { formatDate } from '../utils'
import type { BootstrapData, QueueData } from '../types'

interface QueuePageProps {
  bootstrap: BootstrapData
}

export function QueuePage({ bootstrap }: QueuePageProps) {
  const navigate = useNavigate()
  const [data, setData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyCaseId, setBusyCaseId] = useState('')
  const [rm, setRM] = useState('')
  const [stage, setStage] = useState('')
  const [aging, setAging] = useState('')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    const filters = new URLSearchParams({ rm, stage, aging, search })
    api.queue(filters).then((result) => {
      if (active) {
        setData(result)
        setError('')
      }
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Queue could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [rm, stage, aging, search, bootstrap.role, bootstrap.actor, refreshKey])

  async function createChaseAll(caseId: string) {
    setBusyCaseId(caseId)
    setError('')
    try {
      const detail = await api.caseDetails(caseId)
      const outstandingIds = detail.documents
        .filter((document) => document.storedStatus === 'REQUESTED')
        .map((document) => document.id)
      if (!outstandingIds.length) throw new Error('This case has no outstanding documents to chase.')
      const { reminder } = await api.createDraft(caseId, outstandingIds)
      navigate(`/reminders/${encodeURIComponent(reminder.id)}`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Reminder draft could not be created.')
    } finally {
      setBusyCaseId('')
    }
  }

  const summary = data?.summary

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="live-dot" /> Operations workspace</div>
          <h1>Chase Queue</h1>
          <p>Prioritize the oldest outstanding client documents and keep the next action visible.</p>
        </div>
        <div className="heading-note">
          <TimerReset size={16} aria-hidden="true" />
          <span>Follow-up threshold: {bootstrap.overdueAfterDays} calendar days</span>
        </div>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <div className="metric-label">Cases open</div>
          <div className="metric-value">{loading ? '—' : summary?.casesOpen ?? 0}</div>
          <div className="metric-foot"><span className="metric-icon blue"><FileClock size={17} /></span>Assigned to your current view</div>
        </article>
        <article className="metric-card metric-alert">
          <div className="metric-label">Cases overdue</div>
          <div className="metric-value">{loading ? '—' : summary?.casesOverdue ?? 0}</div>
          <div className="metric-foot"><span className="metric-icon red"><CalendarClock size={17} /></span>Needs a human follow-up</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Median chase stage</div>
          <div className="metric-value">{loading ? '—' : `${summary?.medianDaysInChaseStage ?? 0}`}<small> days</small></div>
          <div className="metric-foot"><span className="metric-icon green"><ArrowDownWideNarrow size={17} /></span>From synthetic stage history</div>
        </article>
      </div>

      <section className="panel queue-panel">
        <div className="panel-heading queue-panel-heading">
          <div>
            <div className="panel-kicker">Case roster</div>
            <h2>Open corporate cases</h2>
          </div>
          <div className="queue-sort"><ArrowDownWideNarrow size={15} /> Oldest outstanding item first</div>
        </div>
        <div className="filter-toolbar">
          <label className="search-field">
            <Search size={17} aria-hidden="true" />
            <input aria-label="Search cases" placeholder="Search client, case ID or RM" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label className="filter-field">
            <span>RM</span>
            <select aria-label="Filter by relationship manager" value={rm} onChange={(event) => setRM(event.target.value)}>
              <option value="">All RMs</option>
              {bootstrap.relationshipManagers.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Stage</span>
            <select aria-label="Filter by stage" value={stage} onChange={(event) => setStage(event.target.value)}>
              <option value="">All stages</option>
              {bootstrap.stages.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Aging</span>
            <select aria-label="Filter by aging" value={aging} onChange={(event) => setAging(event.target.value)}>
              <option value="">All aging</option>
              <option value="overdue">Overdue follow-up</option>
              <option value="due-today">Due today</option>
              <option value="14">Oldest item &gt; 14 days</option>
              <option value="30">Oldest item &gt; 30 days</option>
            </select>
          </label>
          <span className="filter-indicator"><Filter size={15} /> Filters update live</span>
        </div>
        {error && <ErrorState message={error} onRetry={() => setRefreshKey((key) => key + 1)} />}
        {loading && !data ? <LoadingState label="Loading the case queue" /> : (
          <div className="table-scroll">
            <table className="data-table queue-table">
              <thead>
                <tr>
                  <th scope="col">Client / case</th>
                  <th scope="col" className="optional-column">Relationship manager</th>
                  <th scope="col" className="optional-column numeric-cell">Days open</th>
                  <th scope="col">Current stage</th>
                  <th scope="col" className="numeric-cell">Outstanding</th>
                  <th scope="col">Oldest item</th>
                  <th scope="col">Next follow-up</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data?.cases.map((item) => {
                  const caseHref = `/cases/${encodeURIComponent(item.id)}`
                  const documentHref = `${caseHref}?document=${encodeURIComponent(item.oldestOutstandingDocumentId ?? '')}`
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link className="case-name-link" to={caseHref}>{item.clientName}<ArrowUpRight size={14} /></Link>
                        <span className="table-secondary case-id">{item.id}</span>
                      </td>
                      <td className="optional-column">{item.rmName}</td>
                      <td className="optional-column numeric-cell">{item.daysOpen}</td>
                      <td><span className="stage-label">{item.currentStage}</span></td>
                      <td className="numeric-cell">{item.outstandingCount} <span className="table-secondary">docs</span></td>
                      <td>
                        {item.oldestOutstandingDocumentId ? (
                          <Link className={`aging-link ${item.status === 'OVERDUE' ? 'aging-link-alert' : ''}`} to={documentHref}>
                            {item.oldestOutstandingAge}d <span>{item.oldestOutstandingDocumentName}</span>
                          </Link>
                        ) : <span className="table-secondary">—</span>}
                      </td>
                      <td>{formatDate(item.nextFollowUp)}</td>
                      <td><StatusBadge status={item.status} /></td>
                      <td>
                        <button
                          className="button button-secondary button-small chase-button"
                          disabled={item.outstandingCount === 0 || busyCaseId === item.id}
                          onClick={() => void createChaseAll(item.id)}
                        >
                          <Send size={14} aria-hidden="true" />
                          {busyCaseId === item.id ? 'Creating…' : 'Chase all'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {!loading && data?.cases.length === 0 && (
                  <tr><td className="empty-table" colSpan={9}>No cases match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>Showing {data?.cases.length ?? 0} cases · Synthetic demo records only</span>
          <span className="footer-privacy"><span className="live-dot" /> All client messages require RM approval</span>
        </div>
      </section>
    </div>
  )
}
