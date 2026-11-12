export function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return 'Not scheduled'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value)
  return date.toLocaleDateString('en-GB', options ?? { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLocaleLowerCase()
}
