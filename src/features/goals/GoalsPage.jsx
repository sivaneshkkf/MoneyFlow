import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Minus,
  Target,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  History,
  MoreVertical,
  PiggyBank,
  TrendingUp,
  ChevronRight,
  Lightbulb,
  ArrowLeftRight,
} from 'lucide-react'
import { PageContainer, EmptyState, CardSkeleton, ErrorState, Badge } from '../../components/common'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { Field, Select, MoneyInput } from '../../components/common/form'
import { RingProgress } from '../budgets/budgetUi'
import { useGoals, useGoalContributions, useGoalMutations } from './useGoals'
import { goalColor, goalPace, PiggyIllustration } from './goalUi'
import GoalForm from './GoalForm'
import ContributionForm from './ContributionForm'
import { formatCurrency, formatDate } from '../../utils/format'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

// ---------------------------------------------------------------- history modal
function HistoryModal({ goal, onClose }) {
  const { data: rows, isLoading } = useGoalContributions(goal?.id)
  return (
    <Modal open={Boolean(goal)} onClose={onClose} title={`${goal?.name} — contribution history`}>
      {isLoading ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No contributions yet.</p>
      ) : (
        <ul className="divide-y divide-line dark:divide-white/5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p className="font-medium">{formatDate(r.contribution_date)}</p>
                {r.notes && <p className="text-xs text-ink-soft">{r.notes}</p>}
              </div>
              <span className={Number(r.amount) < 0 ? 'font-semibold text-danger' : 'font-semibold text-success'}>
                {Number(r.amount) < 0 ? '−' : '+'}
                {formatCurrency(Math.abs(r.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- move funds
function MoveFundsForm({ goal, goals, onDone }) {
  const { moveFunds } = useGoalMutations()
  const toast = useToast()
  const others = goals.filter((g) => g.id !== goal.id && g.status !== 'archived')
  const max = Number(goal.current_amount)

  const schema = z.object({
    toGoalId: z.string().uuid('Choose a goal'),
    amount: z.coerce
      .number()
      .positive('Amount must be greater than 0')
      .max(max, `Cannot move more than ${formatCurrency(max)}`),
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) })

  if (others.length === 0) {
    return <p className="text-sm text-ink-soft">Create another active goal first to move funds into it.</p>
  }

  const onSubmit = async (v) => {
    try {
      await moveFunds.mutateAsync({ fromGoalId: goal.id, toGoalId: v.toGoalId, amount: v.amount })
      toast.success('Funds moved.')
      onDone()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-sm text-ink-soft">
        Move money out of <b>{goal.name}</b> ({formatCurrency(max)} saved) into another goal.
      </p>
      <Field label="Move to" error={errors.toGoalId?.message}>
        <Select {...register('toGoalId')}>
          <option value="">Select goal</option>
          {others.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (₹)" error={errors.amount?.message}>
        <MoneyInput {...register('amount')} autoFocus />
      </Field>
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Moving…' : 'Move funds'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- kebab menu
function GoalMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({})
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ position: 'fixed', top: r.bottom + 6, left: Math.max(8, r.right - 176), width: 176 })
    const close = (e) => {
      if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', () => setOpen(false), true)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Goal actions"
        className="rounded-lg p-1 text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={pos}
            className="z-[120] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl dark:border-white/10 dark:bg-[#1B2523]"
          >
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  setOpen(false)
                  it.onClick()
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-white/5 ${
                  it.danger ? 'text-danger' : ''
                }`}
              >
                <it.icon className="h-4 w-4" />
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

// ---------------------------------------------------------------- goal card
function GoalCard({ goal, actions }) {
  const color = goalColor(goal.category)
  const current = Number(goal.current_amount)
  const target = Number(goal.target_amount)
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0
  const remaining = Math.max(0, target - current)
  const done = pct >= 100
  const archived = goal.status === 'archived'
  const pace = goalPace(goal)

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full" style={{ background: `${color}1a`, color }}>
            <PiggyBank className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-bold">{goal.name}</h3>
              {archived ? (
                <Badge tone="neutral">Archived</Badge>
              ) : done ? (
                <Badge tone="success">Reached</Badge>
              ) : null}
            </div>
            {goal.category && (
              <span
                className="mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: `${color}1a`, color }}
              >
                {goal.category}
              </span>
            )}
          </div>
        </div>
        <GoalMenu
          items={[
            { label: 'History', icon: History, onClick: actions.onHistory },
            { label: 'Edit', icon: Pencil, onClick: actions.onEdit },
            {
              label: archived ? 'Restore' : 'Archive',
              icon: archived ? ArchiveRestore : Archive,
              onClick: actions.onArchive,
            },
          ]}
        />
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-ink-soft">Saved so far</p>
          <p className="text-3xl font-extrabold tracking-tight">{formatCurrency(current)}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            of {formatCurrency(target)}
            {goal.target_date && (
              <>
                {' · by '}
                <span className="font-semibold text-success">{formatDate(goal.target_date, 'dd MMM yyyy')}</span>
              </>
            )}
          </p>
        </div>
        <RingProgress pct={pct} tone={done ? 'success' : 'success'} size={72} />
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-brand-400/15 dark:bg-white/10">
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-soft">
        <span>{Math.round(pct)}%</span>
        <span>{done ? 'Goal reached 🎉' : `${formatCurrency(remaining)} to go`}</span>
      </div>

      {!archived && !done && pace && (
        <button
          onClick={actions.onHistory}
          className="mt-3 flex w-full items-center gap-2 rounded-xl bg-success/[0.08] px-3 py-2.5 text-left text-sm dark:bg-success/10"
        >
          <TrendingUp className="h-4 w-4 shrink-0 text-success" />
          <span className="flex-1">
            {pace.overdue ? (
              <>Target date passed — {formatCurrency(pace.remaining)} still to save.</>
            ) : (
              <>
                You need to save <b className="text-success">{formatCurrency(pace.perDay)} daily</b> to reach your goal on time.
              </>
            )}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
        </button>
      )}

      {!archived && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={actions.onAdd} disabled={done}>
            <Plus className="h-4 w-4" /> Add money
          </button>
          <button className="btn-ghost" onClick={actions.onWithdraw} disabled={current <= 0}>
            <Minus className="h-4 w-4" /> Withdraw
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-line pt-3 text-xs dark:border-white/10">
        <button className="inline-flex items-center gap-1.5 px-2 py-1 text-ink-soft hover:text-ink" onClick={actions.onHistory}>
          <History className="h-3.5 w-3.5" /> History
        </button>
        <span className="text-line">|</span>
        <button className="inline-flex items-center gap-1.5 px-2 py-1 text-ink-soft hover:text-ink" onClick={actions.onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <span className="text-line">|</span>
        <button className="inline-flex items-center gap-1.5 px-2 py-1 text-ink-soft hover:text-ink" onClick={actions.onMove}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> Move funds
        </button>
        <span className="text-line">|</span>
        <button className="inline-flex items-center gap-1.5 px-2 py-1 text-danger hover:opacity-80" onClick={actions.onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </div>
  )
}

function CreateGoalCard({ onClick }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line p-8 text-center dark:border-white/15">
      <PiggyIllustration />
      <h3 className="mt-3 text-base font-bold">Set a new savings goal</h3>
      <p className="mt-1 max-w-[15rem] text-sm text-ink-soft">Create goals for the things that matter to you.</p>
      <button className="btn-primary mt-4" onClick={onClick}>
        <Plus className="h-4 w-4" /> Create goal
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- page
export default function GoalsPage() {
  const [showArchived, setShowArchived] = useState(false)
  const { data: goals, isLoading, isError, refetch } = useGoals(showArchived)
  const { remove, update } = useGoalMutations()
  const toast = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [contribGoal, setContribGoal] = useState(null)
  const [contribMode, setContribMode] = useState('add')
  const [historyGoal, setHistoryGoal] = useState(null)
  const [moveGoal, setMoveGoal] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const act = async (fn, msg) => {
    try {
      await fn()
      toast.success(msg)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const list = goals ?? []
  const hasContent = list.length > 0

  return (
    <PageContainer
      title="Savings Goals"
      subtitle="Save with intent — track progress toward what matters."
      action={
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setShowArchived((v) => !v)}>
            <Archive className="h-4 w-4" /> {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Create goal
          </button>
        </div>
      }
    >
      {isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="Unable to load your goals." onRetry={refetch} />
      ) : (
        <>
          {list.length === 0 && !showArchived ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <EmptyState
                icon={Target}
                title="No savings goals yet"
                description="Create your first goal — an emergency fund, a trip, a new laptop."
                action={
                  <button className="btn-primary" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Create goal
                  </button>
                }
              />
              <CreateGoalCard onClick={openCreate} />
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {list.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  actions={{
                    onAdd: () => {
                      setContribGoal(g)
                      setContribMode('add')
                    },
                    onWithdraw: () => {
                      setContribGoal(g)
                      setContribMode('withdraw')
                    },
                    onHistory: () => setHistoryGoal(g),
                    onEdit: () => {
                      setEditing(g)
                      setFormOpen(true)
                    },
                    onMove: () => setMoveGoal(g),
                    onDelete: () => setDeleting(g),
                    onArchive: () =>
                      act(
                        () => update.mutateAsync({ id: g.id, status: g.status === 'archived' ? 'active' : 'archived' }),
                        g.status === 'archived' ? 'Goal restored.' : 'Goal archived.',
                      ),
                  }}
                />
              ))}
              <CreateGoalCard onClick={openCreate} />
            </div>
          )}

          {hasContent && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-success/[0.06] p-4 text-sm dark:bg-success/10">
              <span className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 shrink-0 text-success" />
                <span>
                  <b>Tip: Automate your savings</b> — Set up recurring transfers to stay consistent and reach your
                  goals faster.
                </span>
              </span>
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => toast.info('Recurring transfers are coming soon.')}>
                Learn more
              </button>
            </div>
          )}
        </>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit goal' : 'Create goal'}>
        <GoalForm initial={editing} onDone={() => setFormOpen(false)} />
      </Modal>

      <Modal
        open={Boolean(contribGoal)}
        onClose={() => setContribGoal(null)}
        title={contribMode === 'withdraw' ? 'Withdraw from goal' : 'Add money to goal'}
      >
        {contribGoal && (
          <ContributionForm goal={contribGoal} mode={contribMode} onDone={() => setContribGoal(null)} />
        )}
      </Modal>

      <Modal open={Boolean(moveGoal)} onClose={() => setMoveGoal(null)} title="Move funds">
        {moveGoal && <MoveFundsForm goal={moveGoal} goals={list} onDone={() => setMoveGoal(null)} />}
      </Modal>

      <HistoryModal goal={historyGoal} onClose={() => setHistoryGoal(null)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => act(() => remove.mutateAsync(deleting.id), 'Goal deleted.').then(() => setDeleting(null))}
        title="Delete goal?"
        message="This removes the goal and its full contribution history."
        confirmLabel="Delete"
        loading={remove.isPending}
      />
    </PageContainer>
  )
}
