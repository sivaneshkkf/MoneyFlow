import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, CalendarClock, AlertTriangle, CircleCheck, Wallet, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { PageContainer, StatCard, Badge, EmptyState, Skeleton } from '../../components/common'
import Modal from '../../components/common/Modal'
import CategoryIcon from '../../components/categories/CategoryIcon'
import { formatCurrency, formatDate } from '../../utils/format'
import { useRecurringPayments, useBillsSummary, useProcessRecurring } from './useBills'
import BillForm from './BillForm'
import PaymentForm from './PaymentForm'
import { FILTERS, SORTS, kindMeta, frequencyLabel, occurrenceDueLabel } from './billMeta'
import { useSubscriptionLimits } from '../subscription/hooks/useSubscriptionLimits'
import UpgradeModal from '../subscription/components/UpgradeModal'

const TONE_TEXT = {
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  success: 'text-success',
  neutral: 'text-ink-soft',
}

// The everyday case: this definition has exactly one occurrence this month
// (true for monthly/weekly/yearly bills, the vast majority) — same card as
// always, unchanged.
function OccurrenceCard({ d, o, onPay }) {
  const isPaid = o.status === 'paid'
  const due = occurrenceDueLabel(o.due_date, o.status)
  const meta = kindMeta(d.kind)
  return (
    <div className={clsx('card flex flex-col gap-3 p-4', isPaid && 'opacity-75')}>
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ background: `${d.category?.color ?? meta.color}1f`, color: d.category?.color ?? meta.color }}
        >
          {d.category?.icon ? <CategoryIcon name={d.category.icon} size={18} /> : <meta.icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <Link to={`/bills/${d.id}`} className="truncate text-sm font-bold hover:underline">
            {d.displayName}
          </Link>
          <p className="text-xs text-ink-soft">{isPaid ? `Paid ${formatDate(o.paid_at)}` : formatDate(o.due_date)}</p>
        </div>
        {due && <Badge tone={due.tone}>{due.text}</Badge>}
      </div>
      <p className="text-lg font-bold">{formatCurrency(isPaid ? o.paid_amount || o.scheduled_amount : o.scheduled_amount)}</p>
      {isPaid ? (
        <span className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-success/10 py-2 text-sm font-semibold text-success">
          <CircleCheck className="h-4 w-4" /> Paid
        </span>
      ) : (
        <button className="btn-primary w-full !py-2 text-sm" onClick={() => onPay(o)}>
          Mark as paid
        </button>
      )}
    </div>
  )
}

// A high-frequency definition (daily, most often) can have dozens of
// occurrences in one month — one summary card instead of flooding the grid,
// "View all" goes to the definition's own detail page, which already lists
// every occurrence (Upcoming occurrences + Payment history).
function MonthGroupCard({ d, occurrences }) {
  const meta = kindMeta(d.kind)
  const pending = occurrences.filter((o) => o.status !== 'paid')
  const paidCount = occurrences.length - pending.length
  const pendingTotal = pending.reduce((sum, o) => sum + Number(o.scheduled_amount), 0)
  const next = pending[0]
  const due = next ? occurrenceDueLabel(next.due_date, next.status) : null

  return (
    <Link
      to={`/bills/${d.id}`}
      className="card group flex flex-col gap-3 p-4 text-left transition hover:border-brand-400 dark:hover:border-brand-400/60"
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ background: `${d.category?.color ?? meta.color}1f`, color: d.category?.color ?? meta.color }}
        >
          {d.category?.icon ? <CategoryIcon name={d.category.icon} size={18} /> : <meta.icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{d.displayName}</p>
          <p className="text-xs text-ink-soft">
            {frequencyLabel(d.frequency)} · {occurrences.length} payments this month
          </p>
        </div>
        {due && <Badge tone={due.tone}>{due.text}</Badge>}
      </div>
      <div>
        <p className="text-lg font-bold">{formatCurrency(pendingTotal)}</p>
        <p className="text-xs text-ink-soft">
          {pending.length} pending{paidCount > 0 ? ` · ${paidCount} paid` : ''}
        </p>
      </div>
      <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-line py-2 text-sm font-semibold text-ink-soft transition group-hover:text-ink dark:border-white/10">
        View all <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  )
}

export default function BillsPage() {
  useProcessRecurring()
  const { data: defs, isLoading } = useRecurringPayments()
  const { data: summary } = useBillsSummary()

  const [addOpen, setAddOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [pay, setPay] = useState(null) // { occurrence, def }
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('next_due')
  const [q, setQ] = useState('')
  const { canCreate } = useSubscriptionLimits()

  const openAdd = () => {
    if (!canCreate('bills')) {
      setUpgradeOpen(true)
      return
    }
    setAddOpen(true)
  }

  // One entry per recurring definition — a daily (or otherwise
  // high-frequency) item can have dozens of occurrences in a single month,
  // which would otherwise flood this grid with near-identical cards. Each
  // group carries every one of that definition's occurrences for the
  // month (sorted, unpaid first); the card itself only shows a summary,
  // with "View all" going to the definition's own detail page.
  const upcomingGroups = useMemo(() => {
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` // yyyy-MM
    const groups = []
    for (const d of defs ?? []) {
      const occurrences = []
      for (const o of d.openOccurrences) {
        if (d.status !== 'active') continue
        // Current calendar month only — plus anything already overdue so it is never hidden.
        if (o.due_date.slice(0, 7) === monthKey || o.status === 'overdue') occurrences.push(o)
      }
      // payments already made this month
      for (const o of d.paidThisMonth ?? []) occurrences.push(o)
      if (occurrences.length === 0) continue

      occurrences.sort((a, b) => {
        const ap = a.status === 'paid'
        const bp = b.status === 'paid'
        if (ap !== bp) return ap ? 1 : -1 // unpaid first
        const ad = ap ? a.paid_at : a.due_date
        const bd = bp ? b.paid_at : b.due_date
        return String(ad).localeCompare(String(bd))
      })
      groups.push({ def: d, occurrences })
    }
    return groups
      .sort((a, b) => {
        const af = a.occurrences[0]
        const bf = b.occurrences[0]
        const ap = af.status === 'paid'
        const bp = bf.status === 'paid'
        if (ap !== bp) return ap ? 1 : -1
        const ad = ap ? af.paid_at : af.due_date
        const bd = bp ? bf.paid_at : bf.due_date
        return String(ad).localeCompare(String(bd))
      })
      .slice(0, 18)
  }, [defs])

  const list = useMemo(() => {
    let rows = defs ?? []
    const term = q.trim().toLowerCase()
    if (term) {
      rows = rows.filter(
        (d) =>
          d.displayName.toLowerCase().includes(term) ||
          (d.merchant_name ?? '').toLowerCase().includes(term) ||
          (d.notes ?? '').toLowerCase().includes(term),
      )
    }
    if (['bill', 'emi', 'subscription', 'recurring'].includes(filter)) rows = rows.filter((d) => d.kind === filter)
    else if (filter === 'upcoming') rows = rows.filter((d) => d.nextOccurrence && d.nextOccurrence.status !== 'overdue')
    else if (filter === 'due') rows = rows.filter((d) => d.nextOccurrence?.status === 'due')
    else if (filter === 'overdue') rows = rows.filter((d) => d.overdueCount > 0)
    else if (filter === 'paid') rows = rows.filter((d) => d.status === 'active' && !d.nextOccurrence)
    else if (filter === 'inactive') rows = rows.filter((d) => d.status !== 'active')

    const by = {
      next_due: (a, b) => (a.nextOccurrence?.due_date ?? '9999').localeCompare(b.nextOccurrence?.due_date ?? '9999'),
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      amount_desc: (a, b) => Number(b.amount) - Number(a.amount),
      amount_asc: (a, b) => Number(a.amount) - Number(b.amount),
      name: (a, b) => a.displayName.localeCompare(b.displayName),
    }
    return [...rows].sort(by[sort] ?? by.next_due)
  }, [defs, q, filter, sort])

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bills &amp; Recurring</h1>
          <p className="mt-1 text-sm text-ink-soft">Manage bills, EMIs, subscriptions and recurring payments.</p>
        </div>
        <button className="btn-primary" onClick={() => openAdd()}>
          <Plus className="h-4 w-4" /> Add payment
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Upcoming" amount={formatCurrency(summary?.upcoming ?? 0)} icon={CalendarClock} hint="Not yet due" />
        <StatCard title="Due this month" amount={formatCurrency(summary?.dueThisMonth ?? 0)} icon={Wallet} hint="This calendar month" />
        <StatCard
          title="Overdue"
          amount={formatCurrency(summary?.overdue ?? 0)}
          icon={AlertTriangle}
          tone={summary?.overdue ? 'danger' : 'neutral'}
          hint={`${summary?.overdueCount ?? 0} payment${(summary?.overdueCount ?? 0) === 1 ? '' : 's'}`}
        />
        <StatCard title="Active payments" amount={String(summary?.activeCount ?? 0)} icon={CircleCheck} hint="Bills, EMIs & subs" />
      </div>

      {/* This month's payments */}
      <div className="mb-8">
        <h2 className="mb-3 text-base font-bold">This month&apos;s payments</h2>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : upcomingGroups.length === 0 ? (
          <div className="card px-6 py-10 text-center text-sm text-ink-soft">You&apos;re all caught up 🎉</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {upcomingGroups.map(({ def: d, occurrences }) =>
              occurrences.length === 1 ? (
                <OccurrenceCard
                  key={d.id}
                  d={d}
                  o={occurrences[0]}
                  onPay={(o) => setPay({ occurrence: o, def: d })}
                />
              ) : (
                <MonthGroupCard key={d.id} d={d} occurrences={occurrences} />
              ),
            )}
          </div>
        )}
      </div>

      {/* Filters + search */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition',
                filter === f.key
                  ? 'bg-dark text-white dark:bg-brand-700'
                  : 'bg-brand-50 text-ink-soft hover:bg-brand-100 dark:bg-white/5 dark:hover:bg-white/10',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              className="input h-9 w-full pl-9 text-sm"
              placeholder="Search payments…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="input h-9 w-full text-sm sm:w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* All payments */}
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (defs ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled yet"
          description="Add your first bill, EMI or subscription to start tracking upcoming payments."
          action={
            <button className="btn-primary" onClick={() => openAdd()}>
              <Plus className="h-4 w-4" /> Add payment
            </button>
          }
        />
      ) : list.length === 0 ? (
        <div className="card px-6 py-10 text-center text-sm text-ink-soft">No payments match your filters.</div>
      ) : (
        <div className="card divide-y divide-line p-2 dark:divide-white/5">
          {list.map((d) => {
            const meta = kindMeta(d.kind)
            const next = d.nextOccurrence
            const due = next ? occurrenceDueLabel(next.due_date, next.status) : null
            return (
              <Link
                key={d.id}
                to={`/bills/${d.id}`}
                className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-brand-50/60 dark:hover:bg-white/5"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: `${d.category?.color ?? meta.color}1f`, color: d.category?.color ?? meta.color }}
                >
                  {d.category?.icon ? <CategoryIcon name={d.category.icon} size={18} /> : <meta.icon className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold">
                    {d.displayName}
                    {d.status !== 'active' && <Badge tone="neutral">{d.status === 'paused' ? 'Paused' : 'Ended'}</Badge>}
                  </p>
                  <p className="truncate text-xs text-ink-soft">
                    {meta.label} · {frequencyLabel(d.frequency)}
                    {next ? ` · next ${formatDate(next.due_date)}` : ' · no upcoming'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold">{formatCurrency(d.amount)}</p>
                  {due && <span className={clsx('text-[11px] font-semibold', TONE_TEXT[due.tone])}>{due.text}</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add payment" size="lg">
        <BillForm onDone={() => setAddOpen(false)} />
      </Modal>
      <Modal open={Boolean(pay)} onClose={() => setPay(null)} title="Record payment">
        {pay && <PaymentForm occurrence={pay.occurrence} recurring={pay.def} onDone={() => setPay(null)} />}
      </Modal>
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Bills & Recurring"
        description="You've reached the Free plan limit for active bills, EMIs and subscriptions. Upgrade to Pro for unlimited payments."
      />
    </PageContainer>
  )
}
