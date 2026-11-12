import { AlertTriangle, LoaderCircle } from 'lucide-react'

export function LoadingState({ label = 'Loading workspace' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle aria-hidden="true" size={20} className="spin" />
      <span>{label}…</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle aria-hidden="true" size={20} />
      <span>{message}</span>
      {onRetry && <button className="button button-secondary button-small" onClick={onRetry}>Try again</button>}
    </div>
  )
}
