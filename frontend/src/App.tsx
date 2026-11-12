import { useEffect, useState } from 'react'
import {
  Activity,
  Building2,
  ChevronDown,
  FileClock,
  Forward,
  LayoutDashboard,
  ShieldCheck,
} from 'lucide-react'
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { api, getDemoContext, setDemoContext } from './api'
import { AssistantPanel } from './components/AssistantPanel'
import { ErrorState, LoadingState } from './components/Feedback'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { CaseDetailPage } from './pages/CaseDetailPage'
import { HandoffPage } from './pages/HandoffPage'
import { QueuePage } from './pages/QueuePage'
import { ReminderPage } from './pages/ReminderPage'
import type { BootstrapData, DemoOption } from './types'
import './App.css'

function LandingRedirect({ role }: { role: string }) {
  return <Navigate to={role === 'COO' ? '/analytics' : role === 'ANALYST' ? '/handoff' : '/queue'} replace />
}

function Workspace() {
  const navigate = useNavigate()
  const [identity, setIdentity] = useState(getDemoContext)
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)

  useEffect(() => {
    let active = true
    api.bootstrap().then((result) => {
      if (active) setBootstrap(result)
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Northgate Chase could not connect to its API.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [identity.role, identity.actor, bootstrapAttempt])

  function changeIdentity(value: string) {
    const option = bootstrap?.roles.find((item) => `${item.role}|${item.actor}` === value)
    if (!option) return
    setLoading(true)
    setError('')
    setDemoContext(option.role, option.actor)
    setIdentity({ role: option.role, actor: option.actor })
    navigate(option.role === 'COO' ? '/analytics' : option.role === 'ANALYST' ? '/handoff' : '/queue')
  }

  if (loading && !bootstrap) return <LoadingState label="Connecting to Northgate Chase" />
  if (error && !bootstrap) return <div className="startup-error"><ErrorState message={error} onRetry={() => {
    setLoading(true)
    setError('')
    setBootstrapAttempt((attempt) => attempt + 1)
  }} /><p>Start both local services with <code>npm run dev</code>.</p></div>
  if (!bootstrap) return <ErrorState message="Workspace configuration was not returned by the API." />

  const roleOptions: DemoOption[] = bootstrap.roles
  const showQueue = identity.role !== 'COO'
  const showHandoffs = identity.role !== 'COO'
  const showAnalytics = identity.role === 'OPS' || identity.role === 'COO'
  const isRM = identity.role === 'RM'

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to={identity.role === 'COO' ? '/analytics' : '/queue'} className="brand-lockup" aria-label="Northgate Chase home">
          <span className="brand-mark"><Building2 size={19} /></span>
          <span className="brand-name">Northgate <strong>Chase</strong></span>
        </NavLink>
        <div className="topbar-search">
          <FileClock size={16} aria-hidden="true" />
          <span>Corporate onboarding workspace</span>
          <kbd>DEMO</kbd>
        </div>
        <nav className="top-navigation" aria-label="Primary navigation">
          {showQueue && <NavLink to="/queue">Chase Queue</NavLink>}
          {showAnalytics && <NavLink to="/analytics">Stage Analytics</NavLink>}
          {showHandoffs && <NavLink to="/handoff">Analyst Handoff</NavLink>}
        </nav>
        <label className="identity-picker">
          <span className="visually-hidden">Demo role and user</span>
          <select aria-label="Demo role and user" value={`${identity.role}|${identity.actor}`} onChange={(event) => changeIdentity(event.target.value)}>
            {roleOptions.map((option) => (
              <option key={`${option.role}|${option.actor}`} value={`${option.role}|${option.actor}`}>
                {option.label} · {option.actor}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </header>

      <aside className="sidebar">
        <div className="sidebar-product">
          <span className="sidebar-shield"><ShieldCheck size={17} /></span>
          <span><strong>Corporate KYC</strong><small>Onboarding &amp; document chase</small></span>
        </div>
        <div className="sidebar-role">
          <span className="role-avatar">{isRM ? identity.actor.split(' ').map((part) => part[0]).join('') : identity.role === 'OPS' ? 'OP' : identity.role === 'ANALYST' ? 'KA' : 'CO'}</span>
          <span><small>Current demo role</small><strong>{roleLabel(identity.role)}</strong></span>
        </div>
        <nav className="side-navigation" aria-label="Workspace sections">
          {showQueue && <NavLink to="/queue"><LayoutDashboard size={17} /><span>Chase Queue</span></NavLink>}
          {showAnalytics && <NavLink to="/analytics"><Activity size={17} /><span>Stage Analytics</span></NavLink>}
          {showHandoffs && <NavLink to="/handoff"><Forward size={17} /><span>Analyst Handoff</span></NavLink>}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-safety"><ShieldCheck size={15} /><span>RM approval required<br /><strong>No real emails sent</strong></span></div>
          <span className="build-tag">NORTHGATE CHASE · LOCAL DEMO</span>
        </div>
      </aside>

      <main className="main-content">
        <div className="content-inner">
          <Routes>
            <Route path="/" element={<LandingRedirect role={identity.role} />} />
            <Route path="/queue" element={showQueue ? <QueuePage bootstrap={bootstrap} /> : <LandingRedirect role={identity.role} />} />
            <Route path="/cases/:caseId" element={<CaseDetailPage role={identity.role} actor={identity.actor} />} />
            <Route path="/reminders/:reminderId" element={<ReminderPage role={identity.role} actor={identity.actor} />} />
            <Route path="/analytics" element={showAnalytics ? <AnalyticsPage /> : <LandingRedirect role={identity.role} />} />
            <Route path="/handoff" element={showHandoffs ? <HandoffPage role={identity.role} actor={identity.actor} /> : <LandingRedirect role={identity.role} />} />
            <Route path="/handoff/:caseId" element={showHandoffs ? <HandoffPage key={`${identity.role}-${identity.actor}`} role={identity.role} actor={identity.actor} /> : <LandingRedirect role={identity.role} />} />
            <Route path="*" element={<LandingRedirect role={identity.role} />} />
          </Routes>
        </div>
        <footer className="app-footer">
          <span>Northgate Chase · Operational tracking only</span>
          <span>Synthetic records · No external email connection</span>
        </footer>
      </main>
      <AssistantPanel key={`${identity.role}-${identity.actor}`} role={identity.role} actor={identity.actor} />
    </div>
  )
}

function roleLabel(role: string) {
  if (role === 'RM') return 'Relationship Manager'
  if (role === 'OPS') return 'Ops Coordinator'
  if (role === 'ANALYST') return 'KYC Analyst'
  return 'COO · aggregate view'
}

export default function App() {
  return (
    <BrowserRouter>
      <Workspace />
    </BrowserRouter>
  )
}
