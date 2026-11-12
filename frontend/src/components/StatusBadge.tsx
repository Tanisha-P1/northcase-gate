import { AlertCircle, CheckCircle2, Clock3, FileCheck2, FileClock } from 'lucide-react'

const labels: Record<string, string> = {
  ON_TRACK: 'On track',
  DUE_TODAY: 'Due today',
  OVERDUE: 'Overdue',
  REQUESTED: 'Requested',
  RECEIVED: 'Received',
  WAIVED: 'Waived',
  DRAFT: 'Draft · RM approval needed',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  SENT: 'Simulated sent',
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  CLOSED: 'Closed',
}

const icons: Record<string, typeof CheckCircle2> = {
  ON_TRACK: CheckCircle2,
  RECEIVED: FileCheck2,
  WAIVED: FileCheck2,
  DUE_TODAY: Clock3,
  REQUESTED: FileClock,
  DRAFT: Clock3,
  APPROVED: CheckCircle2,
  SCHEDULED: Clock3,
  SENT: CheckCircle2,
  OVERDUE: AlertCircle,
  OPEN: AlertCircle,
}

export function StatusBadge({ status }: { status: string }) {
  const Icon = icons[status] ?? Clock3
  return (
    <span className={`status-badge status-${status.toLowerCase().replaceAll('_', '-')}`}>
      <Icon aria-hidden="true" size={14} strokeWidth={2} />
      {labels[status] ?? status}
    </span>
  )
}
