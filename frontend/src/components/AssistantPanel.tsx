import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  Bot,
  Check,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { api } from '../api'
import { ApiError } from '../api'
import type { AssistantResponse, AssistantSource, DemoRole } from '../types'
import { formatDate } from '../utils'

interface AssistantPanelProps {
  role: DemoRole
  actor: string
}

interface Message {
  id: string
  role: 'assistant' | 'user'
  text: string
  sources?: AssistantSource[]
  reminderDraft?: AssistantResponse['reminderDraft']
  model?: string
}

const starterQuestions: Record<DemoRole, string[]> = {
  RM: ['Which of my cases need follow-up today?', 'Which client has the longest wait?', 'Draft a reminder for NG-2026-8101'],
  OPS: ['Which cases have overdue documents?', 'Which clients have been waiting longest?', 'Why is a UBO stage blocked?'],
  ANALYST: ['Why is the UBO extraction stage blocked?', 'Summarise the linked document handoffs'],
  COO: ['Which stage has the longest median duration?', 'Summarise the aggregate stage durations'],
}

export function AssistantPanel({ role, actor }: AssistantPanelProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingDraftId, setSavingDraftId] = useState('')
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `You are viewing Northgate Chase as ${actor} (${roleLabel(role)}). Ask about the cases available to your role. Answers use database-verified facts and link back to their sources.`,
    },
  ])
  const historyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function ask(rawQuestion = question) {
    const cleanQuestion = rawQuestion.trim()
    if (cleanQuestion.length < 3 || loading) return
    setQuestion('')
    setError('')
    setMessages((current) => [...current, {
      id: `user-${crypto.randomUUID()}`,
      role: 'user',
      text: cleanQuestion,
    }])
    setLoading(true)
    try {
      const response = await api.askAssistant(cleanQuestion)
      setMessages((current) => [...current, {
        id: `assistant-${crypto.randomUUID()}`,
        role: 'assistant',
        text: response.answer,
        sources: response.sources,
        reminderDraft: response.reminderDraft,
        model: response.model,
      }])
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : requestError instanceof Error
          ? requestError.message
          : 'The assistant request could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  async function saveDraft(message: Message) {
    const draft = message.reminderDraft
    if (!draft || role !== 'RM' || savingDraftId) return
    const subjectMatch = message.text.match(/^Subject:\s*(.+)$/im)
    const subject = subjectMatch?.[1]?.trim().slice(0, 200)
      || `Documents needed to complete onboarding (${draft.caseId})`
    setSavingDraftId(message.id)
    setError('')
    try {
      const result = await api.saveAIAssistedDraft({
        ...draft,
        subject,
        body: message.text.replace(/^\s*(?:\*\*)?subject(?:\*\*)?\s*:.*$/gim, '').trim(),
      })
      navigate(`/reminders/${encodeURIComponent(result.reminder.id)}`)
      setOpen(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The RM approval draft could not be saved.')
    } finally {
      setSavingDraftId('')
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void ask()
  }

  return (
    <div className={`assistant-shell ${open ? 'assistant-open' : ''}`}>
      {open && (
        <section className="assistant-panel" aria-label="Northgate AI assistant">
          <div className="assistant-header">
            <span className="assistant-avatar"><Sparkles size={18} /></span>
            <div className="assistant-header-copy"><strong>Northgate Assistant</strong><small>Grounded in your role-scoped case records</small></div>
            <button className="assistant-icon-button" aria-label="Clear conversation" title="Clear conversation" onClick={() => {
              setMessages([{ id: 'welcome', role: 'assistant', text: 'Conversation cleared. Ask about case facts available to your role.' }])
              setError('')
            }}><RotateCcw size={16} /></button>
            <button className="assistant-icon-button" aria-label="Close assistant" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>
          <div className="assistant-safety"><ShieldCheck size={14} /> No credit memo data · No automated decisions · No email delivery</div>
          <div className="assistant-messages" ref={historyRef} aria-live="polite">
            {messages.map((message) => (
              <article className={`assistant-message message-${message.role}`} key={message.id}>
                {message.role === 'assistant' && <span className="message-avatar"><Bot size={15} /></span>}
                <div className="message-content">
                  <div className="message-bubble">
                    {message.text}
                  </div>
                  {message.sources && message.sources.length > 0 && (
                    <div className="assistant-sources">
                      <strong>Sources</strong>
                      {message.sources.map((source, index) => (
                        <Link
                          key={`${source.caseId ?? ''}-${source.documentId ?? index}-${index}`}
                          to={source.caseId
                            ? `/cases/${encodeURIComponent(source.caseId)}${source.documentId ? `?document=${encodeURIComponent(source.documentId)}` : ''}`
                            : '/analytics'}
                          onClick={() => setOpen(false)}
                        >
                          <span>[{index + 1}] {source.label}</span><ArrowUpRight size={13} />
                        </Link>
                      ))}
                    </div>
                  )}
                  {message.reminderDraft && role === 'RM' && (
                    <div className="assistant-draft-preview">
                      <span className="draft-preview-label"><ShieldCheck size={14} /> AI reminder · approval required</span>
                      <p>Case <strong>{message.reminderDraft.caseId}</strong> · {message.reminderDraft.documentIds.length} verified outstanding document(s) · due {formatDate(message.reminderDraft.dueAt)}</p>
                      <button className="button button-primary button-small" disabled={savingDraftId === message.id} onClick={() => void saveDraft(message)}>
                        {savingDraftId === message.id ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
                        {savingDraftId === message.id ? 'Saving draft…' : 'Review & save RM approval draft'}
                      </button>
                      <small>Nothing is sent. The saved draft must be reviewed and approved by the assigned RM.</small>
                    </div>
                  )}
                  {message.model && <small className="assistant-model-note">Answered with {message.model} · source records linked above</small>}
                </div>
              </article>
            ))}
            {loading && (
              <div className="assistant-loading" role="status"><LoaderCircle size={16} className="spin" />Checking role-authorised case facts…</div>
            )}
          </div>
          {messages.length <= 1 && (
            <div className="assistant-starters" aria-label="Example questions">
              {starterQuestions[role].map((starter) => <button key={starter} disabled={loading} onClick={() => void ask(starter)}>{starter}</button>)}
            </div>
          )}
          {error && <div className="assistant-error" role="alert">{error}</div>}
          <form className="assistant-input-form" onSubmit={submitQuestion}>
            <label htmlFor="assistant-question" className="visually-hidden">Ask the assistant about available cases</label>
            <textarea
              id="assistant-question"
              rows={2}
              maxLength={1000}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={role === 'COO' ? 'Ask about aggregate stage metrics…' : 'Ask about documents or follow-ups…'}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void ask()
                }
              }}
            />
            <button type="submit" className="button button-primary assistant-send" aria-label="Send question" disabled={loading || question.trim().length < 3}>
              <Send size={16} />
            </button>
          </form>
          <div className="assistant-input-foot">Enter to send · Shift + Enter for a new line</div>
        </section>
      )}
      <button
        className="assistant-launcher"
        aria-label={open ? 'Close assistant' : 'Ask Northgate Assistant'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X size={19} /> : <MessageSquareText size={19} />}
        <span>{open ? 'Close assistant' : 'Ask Assistant'}</span>
      </button>
    </div>
  )
}

function roleLabel(role: DemoRole) {
  if (role === 'RM') return 'RM'
  if (role === 'OPS') return 'Ops'
  if (role === 'ANALYST') return 'Analyst'
  return 'COO aggregate-only'
}
