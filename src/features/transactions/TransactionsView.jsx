import { useMemo, useState } from 'react'
import {
  Plus,
  Search,
  Download,
  Pencil,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  SlidersHorizontal,
} from 'lucide-react'
import { PageContainer, Badge, EmptyState, Skeleton, ErrorState } from '../../components/common'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import Pagination from '../../components/common/Pagination'
import { Field, Select, TextInput } from '../../components/common/form'
import { useTransactions, useTransactionMutations } from './useTransactions'
import { useCategories } from '../categories/useCategories'
import { useAccounts } from '../accounts/useAccounts'
import { accountOptionLabel } from '../accounts/accountTheme'
import { renderAccountOption } from '../accounts/accountOption'
import TransactionForm from './TransactionForm'
import { formatCurrency, formatFriendlyDate, formatDate } from '../../utils/format'
import { CategoryGlyph } from '../budgets/budgetUi'
import { Landmark } from 'lucide-react'
import { downloadCSV } from '../../utils/csv'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const PAGE_SIZE = 20

export default function TransactionsView({ lockedType = null, title, subtitle, topSlot = null }) {
  const [filters, setFilters] = useState({ search: '', categoryId: '', accountId: '', from: '', to: '', sort: 'transaction_date.desc' })
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const toast = useToast()
  const { remove } = useTransactionMutations()
  const { data: categories = [] } = useCategories(lockedType || undefined)
  const { data: accounts = [] } = useAccounts()

  const query = useTransactions({
    ...filters,
    type: lockedType || undefined,
    categoryId: filters.categoryId || undefined,
    accountId: filters.accountId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const rows = query.data?.rows ?? []
  const total = query.data?.total ?? 0

  const setFilter = (patch) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const handleExport = () => {
    if (!rows.length) return
    downloadCSV(
      `moneyflow-${lockedType || 'transactions'}.csv`,
      rows.map((r) => ({
        date: r.transaction_date,
        type: r.type,
        amount: r.amount,
        category: r.category?.name ?? '',
        account: r.account?.name ?? '',
        payment_method: r.payment_method?.name ?? '',
        description: r.description ?? '',
        notes: r.notes ?? '',
      })),
    )
  }

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Transaction deleted.')
      setDeleting(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const addLabel = lockedType === 'income' ? 'Add income' : lockedType === 'expense' ? 'Add expense' : 'Add transaction'

  const summary = useMemo(() => {
    const list = query.data?.rows ?? []
    const income = list.filter((r) => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0)
    const expense = list.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
    return { income, expense }
  }, [query.data])

  return (
    <PageContainer
      title={title}
      subtitle={subtitle}
      action={
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={handleExport} disabled={!rows.length}>
            <Download className="h-4 w-4" /> Export
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> {addLabel}
          </button>
        </div>
      }
    >
      {topSlot}
      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              className="input rounded-full pl-10"
              placeholder="Search description or notes"
              value={filters.search}
              onChange={(e) => setFilter({ search: e.target.value })}
            />
          </div>
          <Select value={filters.sort} onChange={(e) => setFilter({ sort: e.target.value })} className="w-40">
            <option value="transaction_date.desc">Newest first</option>
            <option value="transaction_date.asc">Oldest first</option>
            <option value="amount.desc">Amount: high → low</option>
            <option value="amount.asc">Amount: low → high</option>
          </Select>
          <button
            className={`btn-ghost ${showFilters ? '!bg-brand-50 !text-brand-700 dark:!bg-white/10' : ''}`}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </button>
        </div>
        {showFilters && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-line pt-3 dark:border-white/10 sm:grid-cols-4">
            <Field label="Category">
              <Select value={filters.categoryId} onChange={(e) => setFilter({ categoryId: e.target.value })}>
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Account">
              <Select
                value={filters.accountId}
                onChange={(e) => setFilter({ accountId: e.target.value })}
                renderOption={renderAccountOption(accounts)}
              >
                <option value="">All</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountOptionLabel(a)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From">
              <TextInput type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
            </Field>
            <Field label="To">
              <TextInput type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
            </Field>
          </div>
        )}
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message="Unable to load your transactions." onRetry={query.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ArrowUpRight}
          title="No transactions yet"
          description="Start tracking your money by adding your first transaction."
          action={
            <button className="btn-primary" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> {addLabel}
            </button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft dark:border-white/10">
                <tr>
                  <th className="px-5 py-3.5">Description</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Account</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const income = t.type === 'income'
                  const color = t.category?.color ?? '#7C9B95'
                  return (
                    <tr key={t.id} className="border-b border-line transition last:border-0 hover:bg-brand-50/40 dark:border-white/5 dark:hover:bg-white/[0.03]">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span
                            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                              income ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger'
                            }`}
                          >
                            {income ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {t.description || 'Untitled'}
                              {t.source === 'lending_interest' && (
                                <Badge tone="info">Interest</Badge>
                              )}
                            </p>
                            {t.notes && <p className="truncate text-xs text-ink-soft">{t.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {t.category ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                            style={{ background: `${color}1a`, color }}
                          >
                            <CategoryGlyph name={t.category.icon} className="h-3 w-3" />
                            {t.category.name}
                          </span>
                        ) : (
                          <span className="text-ink-soft">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium">{formatFriendlyDate(t.transaction_date)}</p>
                        <p className="text-xs text-ink-soft">{formatDate(t.transaction_date, 'dd MMM yyyy')}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        {t.account ? (
                          <div className="flex items-center gap-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-400/12 text-brand-700 dark:text-brand-400">
                              <Landmark className="h-3.5 w-3.5" />
                            </span>
                            <span className="truncate font-medium">{t.account.name}</span>
                          </div>
                        ) : (
                          <span className="text-ink-soft">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <p className={`font-bold ${income ? 'text-success' : 'text-danger'}`}>
                          {income ? '+' : '−'}
                          {formatCurrency(t.amount)}
                        </p>
                        <p className="text-xs capitalize text-ink-soft">{t.type}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          {t.source === 'manual' ? (
                            <>
                              <button
                                className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:border-white/10 dark:hover:bg-white/5"
                                onClick={() => {
                                  setEditing(t)
                                  setFormOpen(true)
                                }}
                                aria-label="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="grid h-8 w-8 place-items-center rounded-lg border border-danger/25 text-danger transition hover:bg-danger/10"
                                onClick={() => setDeleting(t)}
                                aria-label="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-ink-soft">Auto</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((t) => (
              <div key={t.id} className="card p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{t.description || 'Untitled'}</p>
                    <p className="text-xs text-ink-soft">
                      {t.category?.name || '—'} · {formatFriendlyDate(t.transaction_date)}
                    </p>
                  </div>
                  <span className={`font-semibold ${t.type === 'income' ? 'text-success' : 'text-danger'}`}>
                    {t.type === 'income' ? '+' : '-'}
                    {formatCurrency(t.amount)}
                  </span>
                </div>
                {t.source === 'manual' && (
                  <div className="mt-2 flex gap-2 border-t border-line pt-2 dark:border-white/10">
                    <button
                      className="text-xs font-medium text-brand-700"
                      onClick={() => {
                        setEditing(t)
                        setFormOpen(true)
                      }}
                    >
                      Edit
                    </button>
                    <button className="text-xs font-medium text-danger" onClick={() => setDeleting(t)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-ink-soft">
            <span>
              Showing {rows.length} of {total} {lockedType === 'income' ? 'income' : lockedType === 'expense' ? 'expense' : 'transaction'}
              {total === 1 ? '' : 's'}
            </span>
            <span>
              Page totals — <span className="text-success">income {formatCurrency(summary.income)}</span> ·{' '}
              <span className="text-danger">expenses {formatCurrency(summary.expense)}</span>
            </span>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
          </div>
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit transaction' : addLabel}
      >
        <TransactionForm
          initial={editing}
          lockedType={lockedType || undefined}
          onDone={() => setFormOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete transaction?"
        message="This will also reverse its effect on the linked account balance."
        confirmLabel="Delete"
        loading={remove.isPending}
      />
    </PageContainer>
  )
}
