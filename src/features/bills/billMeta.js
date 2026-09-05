import { Receipt, Landmark, Repeat, RefreshCw } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'

// Payment kind → presentation.
export const KIND_META = {
  bill: { label: 'Bill', icon: Receipt, color: '#F59E0B', plural: 'Bills' },
  emi: { label: 'EMI / Loan', icon: Landmark, color: '#EF4444', plural: 'EMIs' },
  subscription: { label: 'Subscription', icon: Repeat, color: '#8B5CF6', plural: 'Subscriptions' },
  recurring: { label: 'Recurring Payment', icon: RefreshCw, color: '#3B82F6', plural: 'Recurring' },
}
export const kindMeta = (k) => KIND_META[k] ?? KIND_META.recurring

export const FREQUENCIES = [
  { key: 'one_time', label: 'One time' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Biweekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
]
export const frequencyLabel = (k) => FREQUENCIES.find((f) => f.key === k)?.label ?? k

export const REMINDER_OPTIONS = [0, 1, 2, 3, 5, 7, 14, 30]

export const WEEKDAYS = [
  { key: 0, label: 'Sunday' },
  { key: 1, label: 'Monday' },
  { key: 2, label: 'Tuesday' },
  { key: 3, label: 'Wednesday' },
  { key: 4, label: 'Thursday' },
  { key: 5, label: 'Friday' },
  { key: 6, label: 'Saturday' },
]
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Occurrence status → badge.
export const OCC_STATUS_META = {
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  due: { label: 'Due', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'danger' },
  paid: { label: 'Paid', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

const startOfToday = () => {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

/** Human due label calculated from the occurrence's OWN due date. */
export function occurrenceDueLabel(dueDate, status) {
  if (status === 'paid') return { text: 'Paid', tone: 'success' }
  if (status === 'skipped') return { text: 'Skipped', tone: 'neutral' }
  if (status === 'cancelled') return { text: 'Cancelled', tone: 'neutral' }
  if (!dueDate) return null
  const days = differenceInCalendarDays(new Date(dueDate), startOfToday())
  if (days < 0) {
    const n = Math.abs(days)
    return { text: `${n} day${n === 1 ? '' : 's'} overdue`, tone: 'danger' }
  }
  if (days === 0) return { text: 'Due today', tone: 'warning' }
  if (days === 1) return { text: 'Due tomorrow', tone: 'warning' }
  return { text: `Due in ${days} days`, tone: days <= 5 ? 'warning' : 'info' }
}

export const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'bill', label: 'Bills' },
  { key: 'emi', label: 'EMIs' },
  { key: 'subscription', label: 'Subscriptions' },
  { key: 'recurring', label: 'Recurring' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'due', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'inactive', label: 'Inactive' },
]

export const SORTS = [
  { key: 'next_due', label: 'Next due' },
  { key: 'newest', label: 'Newest' },
  { key: 'amount_desc', label: 'Amount high → low' },
  { key: 'amount_asc', label: 'Amount low → high' },
  { key: 'name', label: 'Name A → Z' },
]
