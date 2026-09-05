import { differenceInCalendarDays } from 'date-fns'

export const SCHEDULE_FREQUENCIES = [
  { key: 'one_time', label: 'One-time (single due date)', scheduled: false },
  { key: 'weekly', label: 'Weekly', scheduled: true },
  { key: 'biweekly', label: 'Every 2 weeks', scheduled: true },
  { key: 'monthly', label: 'Monthly', scheduled: true },
  { key: 'quarterly', label: 'Quarterly', scheduled: true },
  { key: 'yearly', label: 'Yearly', scheduled: true },
]

const today = () => {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

/** Live status for one installment (recomputed client-side against today). */
export function installmentLiveStatus(inst) {
  if (inst.status === 'cancelled') return { key: 'cancelled', label: 'Cancelled', tone: 'neutral' }
  const paid = Number(inst.paid_amount)
  const scheduled = Number(inst.scheduled_amount)
  if (paid >= scheduled - 0.005) return { key: 'paid', label: 'Paid', tone: 'success' }

  const days = differenceInCalendarDays(new Date(inst.due_date), today())
  const partial = paid > 0.005
  if (days < 0) {
    return {
      key: 'overdue',
      label: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`,
      tone: 'danger',
      partial,
    }
  }
  if (days === 0) return { key: 'due', label: 'Due today', tone: 'warning', partial }
  if (days === 1) return { key: 'due', label: 'Due tomorrow', tone: 'warning', partial }
  if (days <= 5) return { key: 'due_soon', label: `Due in ${days} days`, tone: 'warning', partial }
  return { key: partial ? 'partially_paid' : 'upcoming', label: partial ? 'Partially paid' : 'Upcoming', tone: partial ? 'info' : 'neutral', partial }
}

/**
 * Portfolio-style rollup for a loan from its installments (live, vs today).
 * Falls back to the single-due-date model when there is no schedule.
 */
export function loanScheduleSummary(record, installments) {
  const total = Number(record.principal_amount) + Number(record.interest_amount || 0)

  if (!record.schedule_generated || !installments?.length) {
    const outstanding = Number(record.outstanding ?? record.outstanding_principal) + Number(record.outstanding_interest || 0)
    const days = record.due_date ? differenceInCalendarDays(new Date(record.due_date), today()) : null
    const overdue = days != null && days < 0 && outstanding > 0.005 ? outstanding : 0
    return {
      scheduled: false,
      total,
      paid: Number(record.amount_received),
      outstanding,
      overdueAmount: overdue,
      overdueCount: overdue > 0 ? 1 : 0,
      upcomingAmount: overdue > 0 ? 0 : outstanding,
      nextDueDate: outstanding > 0.005 ? record.due_date : null,
      nextDueAmount: outstanding > 0.005 ? outstanding : 0,
      label: overdue > 0 ? `${Math.abs(days)} days overdue` : record.due_date && outstanding > 0.005 ? dueInWords(days) : null,
      tone: overdue > 0 ? 'danger' : 'info',
    }
  }

  const active = installments.filter((i) => i.status !== 'cancelled')
  let paid = 0
  let outstanding = 0
  let overdueAmount = 0
  let overdueCount = 0
  let upcomingAmount = 0
  let nextDue = null

  for (const i of active) {
    const out = Number(i.outstanding_amount)
    paid += Number(i.paid_amount)
    outstanding += out
    if (out <= 0.005) continue
    const days = differenceInCalendarDays(new Date(i.due_date), today())
    if (days < 0) {
      overdueAmount += out
      overdueCount += 1
    } else {
      upcomingAmount += out
    }
    if (!nextDue || i.due_date < nextDue.due_date) nextDue = { due_date: i.due_date, amount: out }
  }

  const nextDays = nextDue ? differenceInCalendarDays(new Date(nextDue.due_date), today()) : null
  return {
    scheduled: true,
    total,
    paid,
    outstanding,
    overdueAmount,
    overdueCount,
    upcomingAmount,
    nextDueDate: nextDue?.due_date ?? null,
    nextDueAmount: nextDue?.amount ?? 0,
    label:
      overdueCount > 0
        ? `${overdueCount} installment${overdueCount === 1 ? '' : 's'} overdue`
        : nextDue
          ? dueInWords(nextDays)
          : null,
    tone: overdueCount > 0 ? 'danger' : nextDays != null && nextDays <= 5 ? 'warning' : 'info',
  }
}

function dueInWords(days) {
  if (days == null) return null
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

/**
 * Preview how a repayment (principal + interest) will be spread across
 * installments — mirrors the SQL allocation (oldest outstanding first).
 */
export function previewAllocation(installments, principal, interest) {
  let remP = Number(principal) || 0
  let remI = Number(interest) || 0
  const rows = []
  const active = (installments ?? [])
    .filter((i) => i.status !== 'cancelled' && Number(i.outstanding_amount) > 0.005)
    .sort((a, b) => a.installment_number - b.installment_number)

  for (const i of active) {
    if (remP <= 0.005 && remI <= 0.005) break
    const allocP = Math.min(remP, Math.max(0, Number(i.principal_amount) - Number(i.principal_paid)))
    const allocI = Math.min(remI, Math.max(0, Number(i.interest_amount) - Number(i.interest_paid)))
    if (allocP > 0 || allocI > 0) {
      rows.push({ number: i.installment_number, due_date: i.due_date, principal: allocP, interest: allocI })
      remP -= allocP
      remI -= allocI
    }
  }
  if ((remP > 0.005 || remI > 0.005) && active.length) {
    const last = active[active.length - 1]
    const existing = rows.find((r) => r.number === last.installment_number)
    if (existing) {
      existing.principal += remP
      existing.interest += remI
    } else {
      rows.push({ number: last.installment_number, due_date: last.due_date, principal: remP, interest: remI })
    }
  }
  return rows
}
