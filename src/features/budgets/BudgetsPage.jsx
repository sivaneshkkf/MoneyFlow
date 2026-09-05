import { useMemo, useState } from 'react'
import { addMonths, format, getDaysInMonth, startOfMonth, subMonths } from 'date-fns'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Wallet,
  TrendingUp,
  PiggyBank,
  CalendarClock,
  Pencil,
  Trash2,
  BarChart3,
  ChevronRight as ChevronR,
  Lightbulb,
} from 'lucide-react'
import { PageContainer, EmptyState, CardSkeleton, ErrorState, InfoDot } from '../../components/common'
import { Select } from '../../components/common/form'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { useBudgets, useBudgetMutations, useBudgetCategoryTransactions } from './useBudgets'
import { CategoryGlyph, RingProgress, categoryGroup } from './budgetUi'
import BudgetForm from './BudgetForm'
import { formatCurrency, formatDate } from '../../utils/format'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { useSubscriptionLimits } from '../subscription/hooks/useSubscriptionLimits'
import UpgradeModal from '../subscription/components/UpgradeModal'

function StatTile({ icon: Icon, tint, label, value, foot, info }) {
  return (
    <div className={`rounded-2xl border p-4 ${tint.card}`}>
      <div className="flex items-center gap-2.5">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tint.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm text-ink-soft">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
        {foot}
        {info && <InfoDot text={info} />}
      </p>
    </div>
  )
}

const TINTS = {
  green: { card: 'border-success/20 bg-success/[0.06]', icon: 'bg-success/15 text-success' },
  blue: { card: 'border-info/20 bg-info/[0.06]', icon: 'bg-info/15 text-info' },
  amber: { card: 'border-warning/20 bg-warning/[0.06]', icon: 'bg-warning/15 text-warning' },
  purple: { card: 'border-[#8B5CF6]/20 bg-[#8B5CF6]/[0.06]', icon: 'bg-[#8B5CF6]/15 text-[#8B5CF6]' },
}

function BudgetRow({ row, year, month, onEdit, onDelete }) {
  const [showTx, setShowTx] = useState(false)
  const { data: txns = [], isLoading } = useBudgetCategoryTransactions(row.category_id, year, month, showTx)
  const pct = row.status.pct
  const resets = format(addMonths(startOfMonth(new Date(year, month - 1, 1)), 1), 'dd MMM yyyy')

  return (
    <div className="rounded-xl border border-line p-4 dark:border-white/10">
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* icon */}
        <div className="relative shrink-0">
          <span
            className="grid h-14 w-14 place-items-center rounded-full"
            style={{ background: `${row.category?.color ?? '#7C9B95'}22`, color: row.category?.color ?? '#7C9B95' }}
          >
            <CategoryGlyph name={row.category?.icon} />
          </span>
          <span
            className="absolute -right-0.5 top-0 h-3 w-3 rounded-full border-2 border-white dark:border-[#161F1D]"
            style={{ background: row.status.tone === 'danger' ? '#EF4444' : row.status.tone === 'warning' ? '#F59E0B' : '#22C55E' }}
          />
        </div>

        {/* main */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold">{row.category?.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                row.status.tone === 'danger'
                  ? 'bg-danger/15 text-danger'
                  : row.status.tone === 'warning'
                    ? 'bg-warning/15 text-warning'
                    : 'bg-success/15 text-success'
              }`}
            >
              {row.status.label}
            </span>
          </div>
          <p className="text-xs text-ink-soft">{categoryGroup(row.category?.name)}</p>

          <div className="mt-3 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={`font-semibold ${
                    row.status.tone === 'danger' ? 'text-danger' : row.status.tone === 'warning' ? 'text-warning' : 'text-success'
                  }`}
                >
                  {Math.round(pct)}% used
                </span>
                <span className="text-ink-soft">{formatCurrency(Math.max(0, row.remaining))} left</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-brand-400/15 dark:bg-white/10">
                <div
                  className={`h-full rounded-full ${
                    row.status.tone === 'danger' ? 'bg-danger' : row.status.tone === 'warning' ? 'bg-warning' : 'bg-success'
                  }`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-y-3 sm:grid-cols-4">
                <Metric label="Budget" value={formatCurrency(row.amount)} />
                <Metric label="Spent" value={formatCurrency(row.spent)} />
                <Metric label="Remaining" value={formatCurrency(row.remaining)} />
                <div>
                  <p className="text-sm">{formatCurrency(row.spent)} of {formatCurrency(row.amount)}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                    <Calendar className="h-3 w-3" /> Resets on {resets}
                  </p>
                </div>
              </div>
            </div>

            <RingProgress pct={pct} tone={row.status.tone} />
          </div>

          {showTx && (
            <div className="mt-3 rounded-lg border border-line p-3 dark:border-white/10">
              {isLoading ? (
                <p className="text-xs text-ink-soft">Loading transactions…</p>
              ) : txns.length === 0 ? (
                <p className="text-xs text-ink-soft">No transactions in this category this month.</p>
              ) : (
                <ul className="divide-y divide-line text-sm dark:divide-white/5">
                  {txns.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-1.5">
                      <span className="min-w-0 truncate">
                        {t.description || 'Untitled'}
                        <span className="text-ink-soft"> · {formatDate(t.transaction_date, 'dd MMM')}</span>
                      </span>
                      <span className="shrink-0 font-medium text-danger">−{formatCurrency(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 dark:border-white/10">
        <div className="flex gap-2">
          <button className="btn-ghost !py-1.5 text-xs" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            className="btn !border-danger/30 !bg-transparent !py-1.5 text-xs text-danger hover:!bg-danger/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
        <button className="btn-ghost !py-1.5 text-xs" onClick={() => setShowTx((v) => !v)}>
          <BarChart3 className="h-3.5 w-3.5" /> {showTx ? 'Hide details' : 'View details'}
          <ChevronR className={`h-3.5 w-3.5 transition ${showTx ? 'rotate-90' : ''}`} />
        </button>
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

export default function BudgetsPage() {
  const [cursor, setCursor] = useState(new Date())
  const year = cursor.getFullYear()
  const month = cursor.getMonth() + 1

  const { data, isLoading, isError, refetch } = useBudgets(year, month)
  const { remove } = useBudgetMutations()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('spend_desc')
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const { canCreate } = useSubscriptionLimits()

  const openCreate = () => {
    if (!canCreate('budgets')) {
      setUpgradeOpen(true)
      return
    }
    setEditing(null)
    setFormOpen(true)
  }

  const rows = useMemo(() => {
    let r = [...(data?.rows ?? [])]
    if (statusFilter !== 'all') r = r.filter((x) => x.status.key === statusFilter)
    r.sort((a, b) => {
      switch (sort) {
        case 'spend_asc':
          return a.spent - b.spent
        case 'pct_desc':
          return b.status.pct - a.status.pct
        case 'name':
          return (a.category?.name ?? '').localeCompare(b.category?.name ?? '')
        default:
          return b.spent - a.spent
      }
    })
    return r
  }, [data, statusFilter, sort])

  const days = getDaysInMonth(cursor)
  const totalBudget = data?.totalBudget ?? 0
  const totalSpent = data?.totalSpent ?? 0
  const totalRemaining = data?.totalRemaining ?? 0
  const spentPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0
  const catCount = data?.rows?.length ?? 0

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Budget deleted.')
      setDeleting(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <PageContainer
      title="Budgets"
      subtitle="Set monthly limits per category and track them against real spending."
      action={
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Create budget
        </button>
      }
    >
      {/* month nav */}
      <div className="mb-4 flex items-center gap-2">
        <button className="btn-ghost !rounded-full !p-2" onClick={() => setCursor((c) => subMonths(c, 1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold dark:border-white/10 dark:bg-white/5">
          <Calendar className="h-4 w-4 text-ink-soft" /> {format(cursor, 'MMMM yyyy')}
        </span>
        <button className="btn-ghost !rounded-full !p-2" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="Unable to load budgets." onRetry={refetch} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={Wallet}
              tint={TINTS.green}
              label="Total budget"
              value={formatCurrency(totalBudget)}
              foot={`Across ${catCount} categor${catCount === 1 ? 'y' : 'ies'}`}
            />
            <StatTile
              icon={TrendingUp}
              tint={TINTS.blue}
              label="Spent"
              value={formatCurrency(totalSpent)}
              foot={`${spentPct}% of total budget`}
              info="Actual expense transactions this month in budgeted categories."
            />
            <StatTile
              icon={PiggyBank}
              tint={TINTS.amber}
              label="Remaining"
              value={formatCurrency(totalRemaining)}
              foot={`${Math.max(0, 100 - spentPct)}% left to spend`}
            />
            <StatTile
              icon={CalendarClock}
              tint={TINTS.purple}
              label="Avg. daily spend"
              value={formatCurrency(days > 0 ? Math.round(totalSpent / days) : 0)}
              foot={`${formatCurrency(totalSpent)} spent in ${days} days`}
            />
          </div>

          <div className="mt-6 card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Categories</h2>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-400/15 px-1.5 text-xs font-semibold text-ink-soft">
                  {catCount}
                </span>
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-32">
                  <option value="all">All ({catCount})</option>
                  <option value="healthy">Under budget</option>
                  <option value="warning">Near limit</option>
                  <option value="critical">Critical</option>
                  <option value="exceeded">Exceeded</option>
                </Select>
                <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-44">
                  <option value="spend_desc">Spend: High to Low</option>
                  <option value="spend_asc">Spend: Low to High</option>
                  <option value="pct_desc">% used: High to Low</option>
                  <option value="name">Name (A–Z)</option>
                </Select>
              </div>
            </div>

            {catCount === 0 ? (
              <EmptyState
                icon={PiggyBank}
                title="No budgets created for this month"
                description="Create a budget to cap spending in a category."
                action={
                  <button className="btn-primary" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Create budget
                  </button>
                }
              />
            ) : rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-ink-soft">No budgets match this filter.</p>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <BudgetRow
                    key={row.id}
                    row={row}
                    year={year}
                    month={month}
                    onEdit={() => {
                      setEditing(row)
                      setFormOpen(true)
                    }}
                    onDelete={() => setDeleting(row)}
                  />
                ))}
              </div>
            )}
          </div>

          {catCount > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-success/[0.07] p-3.5 text-sm dark:bg-success/10">
              <Lightbulb className="h-4 w-4 shrink-0 text-success" />
              <span>
                <b>Tip:</b>{' '}
                {totalRemaining >= 0
                  ? `You're doing great! You have ${formatCurrency(totalRemaining)} left to spend this month.`
                  : `You're ${formatCurrency(Math.abs(totalRemaining))} over budget this month — review your top categories.`}
              </span>
            </div>
          )}
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit budget' : `New budget · ${format(cursor, 'MMMM yyyy')}`}
      >
        <BudgetForm
          initial={editing}
          year={year}
          month={month}
          existingCategoryIds={(data?.rows ?? []).map((r) => r.category_id)}
          onDone={() => setFormOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete budget?"
        confirmLabel="Delete"
        loading={remove.isPending}
      />
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Budgets"
        description="You've reached the Free plan budget limit for this month. Upgrade to Pro for unlimited budgets."
      />
    </PageContainer>
  )
}
