import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
} from 'date-fns'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(value, { precise = false } = {}) {
  const n = Number(value) || 0
  return (precise ? inrPrecise : inr).format(n)
}

export function formatSignedCurrency(value) {
  const n = Number(value) || 0
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${formatCurrency(Math.abs(n))}`
}

export function formatPercent(value, digits = 1) {
  const n = Number(value) || 0
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
}

export function formatDate(date, pattern = 'dd MMM yyyy') {
  if (!date) return '—'
  return format(new Date(date), pattern)
}

export function formatFriendlyDate(date) {
  if (!date) return '—'
  const d = new Date(date)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'dd MMM yyyy')
}

export function formatRelative(date) {
  if (!date) return '—'
  return `${formatDistanceToNowStrict(new Date(date))} ago`
}

export function dueLabel(dueDate) {
  if (!dueDate) return null
  // Calendar-day difference (ignores time of day) so every view agrees.
  const diffDays = differenceInCalendarDays(new Date(dueDate), new Date())
  if (diffDays < 0) {
    const n = Math.abs(diffDays)
    return { text: `${n} day${n === 1 ? '' : 's'} overdue`, tone: 'danger' }
  }
  if (diffDays === 0) return { text: 'Due today', tone: 'warning' }
  if (diffDays === 1) return { text: 'Due tomorrow', tone: 'warning' }
  return { text: `Due in ${diffDays} days`, tone: diffDays <= 5 ? 'warning' : 'info' }
}
