import { useEffect, useState } from 'react'
import { Activity, BarChart3, Clock3, Gauge, Layers3, ShieldCheck, UsersRound } from 'lucide-react'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/Feedback'
import type { AnalyticsData } from '../types'

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    api.analytics().then((result) => {
      if (active) {
        setData(result)
        setError('')
      }
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Stage analytics could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey])

  function retry() {
    setError('')
    setRefreshKey((key) => key + 1)
  }

  if (loading && !data) return <LoadingState label="Loading aggregate stage analytics" />
  if (error && !data) return <ErrorState message={error} onRetry={retry} />
  if (!data) return <ErrorState message="Analytics data was not returned by the API." />

  const maxDuration = Math.max(...data.stageDurations.map((stage) => stage.medianDays), 1)

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><Activity size={14} /> COO oversight · Aggregate only</div>
          <h1>Stage Analytics</h1>
          <p>Find operational bottlenecks from synthetic stage history and document chase rounds.</p>
        </div>
        <div className="heading-note"><ShieldCheck size={16} /> No client dossier or credit memo content</div>
      </div>

      {error && <ErrorState message={error} onRetry={retry} />}

      <div className="metric-grid analytics-metrics">
        <article className="metric-card metric-alert">
          <div className="metric-label">Median chase stage</div>
          <div className="metric-value">{data.medianChaseDays}<small> days</small></div>
          <div className="metric-foot"><Clock3 size={16} /> Current operational bottleneck</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Synthetic case cohort</div>
          <div className="metric-value">{data.monthlyIntake}</div>
          <div className="metric-foot"><UsersRound size={16} /> Cases in the demo dataset</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Round 3 documents</div>
          <div className="metric-value">{data.chaseRounds.find((round) => round.round === 3)?.documentCount ?? 0}</div>
          <div className="metric-foot"><Gauge size={16} /> Escalation tracking only</div>
        </article>
      </div>

      <div className="analytics-layout">
        <section className="panel stage-analytics-panel">
          <div className="panel-heading">
            <div><div className="panel-kicker">Median days per stage</div><h2><Layers3 size={19} /> Onboarding stage durations</h2></div>
            <span className="aggregate-tag">Aggregate only</span>
          </div>
          <div className="stage-bars">
            {data.stageDurations.map((stage) => (
              <div className={`stage-bar-row ${stage.stage === 'Chasing Missing Docs' ? 'stage-bar-highlight' : ''}`} key={stage.stage}>
                <div className="stage-bar-label">
                  <span>{stage.stage}</span>
                  <span className="table-secondary">{stage.casesMeasured} synthetic observations</span>
                </div>
                <div className="stage-bar-track" role="img" aria-label={`${stage.stage}: median ${stage.medianDays} days`}>
                  <span style={{ width: `${Math.max(4, (stage.medianDays / maxDuration) * 100)}%` }} />
                </div>
                <strong className="stage-bar-value">{stage.medianDays}<small>d</small></strong>
              </div>
            ))}
          </div>
          <div className="analytics-footnote"><Clock3 size={15} />Stage medians are calculated from the seeded, synthetic stage-duration history.</div>
        </section>

        <section className="panel rounds-panel">
          <div className="panel-heading">
            <div><div className="panel-kicker">Current outstanding items</div><h2><BarChart3 size={19} /> Chase-round distribution</h2></div>
          </div>
          <div className="round-list">
            {data.chaseRounds.map((round) => (
              <div className="round-row" key={round.round}>
                <div className={`round-number round-${round.round}`}>{round.round === 3 ? '3+' : round.round}</div>
                <div className="round-info">
                  <div className="round-title">Round {round.round}{round.round === 3 ? ' · final' : ''}<strong>{round.documentCount}</strong></div>
                  <div className="round-track"><span style={{ width: `${round.percentage}%` }} /></div>
                </div>
                <span className="round-percent">{round.percentage}%</span>
              </div>
            ))}
          </div>
          <div className="analytics-footnote"><ShieldCheck size={15} />Chase counts reflect document reminders only, not KYC or UBO decisions.</div>
        </section>
      </div>

      <section className="analytics-boundary">
        <span className="boundary-icon"><ShieldCheck size={18} /></span>
        <div><strong>Operational visibility, not decision automation</strong><p>Northgate Chase tracks requested documents and elapsed time. KYC, UBO, sanctions, and credit decisions remain with accountable human reviewers.</p></div>
      </section>
    </div>
  )
}
