import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import {
  Plus,
  HandCoins,
  Search,
  Download,
  AlertTriangle,
  LayoutGrid,
  List,
  User,
} from 'lucide-react'
import clsx from 'clsx'
import { PageContainer, Badge, EmptyState, Skeleton, ErrorState, SectionHeader } from '../../components/common'
import Modal from '../../components/common/Modal'
import {
  useLendingSummary,
  useLendingRecords,
  useBorrowers,
  useLendingTrend,
  useRefreshLendingStatus,
} from './useLending'
import LendingHero from './LendingHero'
import LendingForm from './LendingForm'
import { STATUS_META, STATUS_FILTERS } from './status'
import { formatCurrency, formatDate, dueLabel } from '../../utils/format'
import { downloadCSV } from '../../utils/csv'
import { useSubscriptionLimits } from '../subscription/hooks/useSubscriptionLimits'
import UpgradeModal from '../subscription/components/UpgradeModal'

function LoanCard({ r }) {
  const meta = STATUS_META[r.status]
  const due = dueLabel(r.nextDueDate)
  const expected = Number(r.total_expected_amount) || Number(r.principal_amount)
  const pct = expected > 0 ? Math.min(100, (Number(r.amount_received) / expected) * 100) : 0
  const overdue = r.overdueAmount > 0.005

  return (
    <Link
      to={`/lending/${r.id}`}
      className="group flex flex-col rounded-2xl border border-line bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-[#161F1D]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-800 dark:bg-white/10 dark:text-brand-400">
            <User className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{r.borrower_name}</p>
            {r.phone && <p className="truncate text-xs text-ink-soft">{r.phone}</p>}
          </div>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <p className="mt-3 text-2xl font-bold tracking-tight">{formatCurrency(r.principal_amount)}</p>
      <p className="text-xs text-ink-soft">principal lent</p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-brand-400/15 dark:bg-white/10">
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
        <span className="text-ink-soft">
          Received
          <br />
          <b className="text-success">{formatCurrency(r.amount_received)}</b>
        </span>
        <span className="text-ink-soft">
          Outstanding
          <br />
          <b className="text-warning">{formatCurrency(r.outstanding)}</b>
        </span>
      </div>

      <div className="mt-3">
        {overdue ? (
          <Badge tone="danger">
            {formatCurrency(r.overdueAmount)} overdue
            {r.overdueCount > 1 ? ` · ${r.overdueCount} inst.` : ''}
          </Badge>
        ) : due ? (
          <Badge tone={due.tone}>{due.text}</Badge>
        ) : (
          <span className="text-xs text-ink-soft">Lent {formatDate(r.lending_date, 'dd MMM yyyy')}</span>
        )}
      </div>
    </Link>
  )
}

export default function LendingGivenPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('grid')
  const [formOpen, setFormOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const { canCreate } = useSubscriptionLimits()

  const openCreate = () => {
    if (!canCreate('lending_records')) {
      setUpgradeOpen(true)
      return
    }
    setFormOpen(true)
  }

  useRefreshLendingStatus()
  const summary = useLendingSummary()
  const records = useLendingRecords({ status: status || undefined, search })
  const borrowers = useBorrowers()
  const trend = useLendingTrend(6)

  const rows = records.data ?? []
  const overdueRows = rows.filter((r) => r.overdueAmount > 0.005)

  const exportCSV = () =>
    downloadCSV(
      'moneyflow-lending.csv',
      rows.map((r) => ({
        borrower: r.borrower_name,
        principal: r.principal_amount,
        interest: r.interest_amount,
        received: r.amount_received,
        outstanding: r.outstanding,
        lending_date: r.lending_date,
        due_date: r.due_date ?? '',
        status: r.status,
      })),
    )

  return (
    <PageContainer
      title="Money Lent"
      subtitle="Track money you've lent, repayments, interest and what's still outstanding."
      action={
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCSV} disabled={!rows.length}>
            <Download className="h-4 w-4" /> Export
          </button>
          <button className="btn-primary" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" /> Add lent money
          </button>
        </div>
      }
    >
      <div className="mb-6">
        {summary.isError ? (
          <ErrorState message="Unable to load lending summary." onRetry={summary.refetch} />
        ) : (
          <LendingHero summary={summary.data} loading={summary.isLoading} overdueLoans={overdueRows.length} />
        )}
      </div>

      {/* --- your loans --- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Your loans</h2>
        <div className="flex rounded-xl border border-line p-0.5 dark:border-white/10">
          <button
            onClick={() => setView('grid')}
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            className={clsx('rounded-lg p-1.5 transition', view === 'grid' ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('list')}
            aria-label="List view"
            aria-pressed={view === 'list'}
            className={clsx('rounded-lg p-1.5 transition', view === 'list' ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft')}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            className="input rounded-full pl-10"
            placeholder="Search borrower"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={clsx(
                'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                status === f.key ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft hover:bg-brand-50 dark:hover:bg-white/5',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {records.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : records.isError ? (
          <ErrorState message="Unable to load lending records." onRetry={records.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No money lent yet"
            description="Keep track of money you've lent and repayments in one place."
            action={
              <button className="btn-primary" onClick={() => openCreate()}>
                <Plus className="h-4 w-4" /> Add lent money
              </button>
            }
          />
        ) : view === 'list' ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft dark:border-white/10">
                <tr>
                  <th className="px-5 py-3.5">Borrower</th>
                  <th className="px-5 py-3.5 text-right">Lent</th>
                  <th className="px-5 py-3.5 text-right">Received</th>
                  <th className="px-5 py-3.5 text-right">Outstanding</th>
                  <th className="px-5 py-3.5">Next due</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-brand-50/40 dark:border-white/5">
                    <td className="px-5 py-3.5">
                      <Link to={`/lending/${r.id}`} className="font-medium hover:underline">
                        {r.borrower_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-right">{formatCurrency(r.principal_amount)}</td>
                    <td className="px-5 py-3.5 text-right text-success">{formatCurrency(r.amount_received)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-warning">{formatCurrency(r.outstanding)}</td>
                    <td className="px-5 py-3.5 text-ink-soft">{r.nextDueDate ? formatDate(r.nextDueDate) : '—'}</td>
                    <td className="px-5 py-3.5">
                      {r.overdueAmount > 0.005 ? (
                        <Badge tone="danger">{formatCurrency(r.overdueAmount)} overdue</Badge>
                      ) : (
                        <Badge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((r) => (
              <LoanCard key={r.id} r={r} />
            ))}
            <button
              type="button"
              onClick={() => openCreate()}
              className="group flex min-h-[188px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white/40 text-center transition hover:border-brand-400 hover:bg-brand-50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-brand-700 transition group-hover:scale-105 dark:bg-white/10 dark:text-brand-400">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold">Add lent money</span>
              <span className="text-xs text-ink-soft">Record a new loan to a borrower</span>
            </button>
          </div>
        )}
      </div>

      {/* --- secondary: chart + overdue + borrowers --- */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <SectionHeader title="Lending vs recovery (6 months)" />
          {trend.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" vertical={false} />
                  <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    formatter={(v, n) => [formatCurrency(v), n === 'lent' ? 'Lent' : 'Recovered']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #E4E9E7', fontSize: 12 }}
                  />
                  <Legend formatter={(v) => (v === 'lent' ? 'Lent' : 'Recovered')} />
                  <Bar dataKey="lent" fill="#315C54" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="recovered" fill="#22C55E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-5">
          <SectionHeader title="Overdue" />
          {overdueRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">Nothing overdue. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {overdueRows.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl border border-danger/30 bg-danger/5 px-3 py-2">
                  <div className="min-w-0">
                    <Link to={`/lending/${r.id}`} className="truncate text-sm font-medium hover:underline">
                      {r.borrower_name}
                    </Link>
                    <p className="text-xs text-danger">
                      {formatCurrency(r.overdueAmount)} overdue
                      {r.overdueCount > 1 ? ` · ${r.overdueCount} installments` : r.daysOverdue > 0 ? ` · ${r.daysOverdue} days` : ''}
                    </p>
                  </div>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {borrowers.data && borrowers.data.length > 0 && (
        <div className="mt-6">
          <SectionHeader title="By borrower" />
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft dark:border-white/10">
                <tr>
                  <th className="px-5 py-3.5">Name</th>
                  <th className="px-5 py-3.5">Phone</th>
                  <th className="px-5 py-3.5 text-right">Total lent</th>
                  <th className="px-5 py-3.5 text-right">Received</th>
                  <th className="px-5 py-3.5 text-right">Outstanding</th>
                  <th className="px-5 py-3.5">Next due</th>
                </tr>
              </thead>
              <tbody>
                {borrowers.data.map((b) => (
                  <tr key={b.borrower_name} className="border-b border-line last:border-0 dark:border-white/5">
                    <td className="px-5 py-3.5 font-medium">
                      {b.borrower_name}
                      {b.overdue && <Badge tone="danger">Overdue</Badge>}
                    </td>
                    <td className="px-5 py-3.5 text-ink-soft">{b.phone || '—'}</td>
                    <td className="px-5 py-3.5 text-right">{formatCurrency(b.totalLent)}</td>
                    <td className="px-5 py-3.5 text-right text-success">{formatCurrency(b.totalReceived)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-warning">{formatCurrency(b.outstanding)}</td>
                    <td className="px-5 py-3.5 text-ink-soft">{b.nextDue ? formatDate(b.nextDue) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Add lent money" size="lg">
        <LendingForm onDone={() => setFormOpen(false)} />
      </Modal>
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Lending records"
        description="You've reached the Free plan limit for active lending records. Upgrade to Pro for unlimited records."
      />
    </PageContainer>
  )
}
