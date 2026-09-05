import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  Circle,
  CircleDot,
  Dot,
  Link2,
  Calendar,
  Plus,
  MoreVertical,
  Pencil,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import Modal from '../../components/common/Modal'
import { Field, TextInput } from '../../components/common/form'
import { installmentLiveStatus } from './schedule'
import { useLendingMutations } from './useLending'
import { formatCurrency, formatDate } from '../../utils/format'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

// --- status → visual tokens -------------------------------------------------
function tokens(key) {
  switch (key) {
    case 'paid':
      return { dot: 'bg-success text-white', chip: 'bg-success/10 text-success', badge: 'bg-success/15 text-success', bar: 'bg-success', DotIcon: Check, num: 'text-success' }
    case 'overdue':
      return { dot: 'bg-danger text-white', chip: 'bg-danger/10 text-danger', badge: 'bg-danger/15 text-danger', bar: 'bg-danger', DotIcon: Dot, num: 'text-danger' }
    case 'due':
    case 'due_soon':
      return { dot: 'bg-warning text-white', chip: 'bg-warning/12 text-warning', badge: 'bg-warning/15 text-warning', bar: 'bg-warning', DotIcon: CircleDot, num: 'text-warning' }
    case 'partially_paid':
      return { dot: 'bg-warning text-white', chip: 'bg-warning/12 text-warning', badge: 'bg-warning/15 text-warning', bar: 'bg-warning', DotIcon: CircleDot, num: 'text-warning' }
    default:
      return { dot: 'bg-ink-soft/70 text-white', chip: 'bg-brand-400/12 text-ink-soft', badge: 'bg-info/10 text-info', bar: 'bg-brand-600', DotIcon: Circle, num: 'text-ink-soft' }
  }
}

// --- per-row kebab menu ----------------------------------------------------
function RowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({})
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ position: 'fixed', top: r.bottom + 6, left: Math.max(8, r.right - 172), width: 172 })
    const close = (e) => {
      if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Installment actions"
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
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-white/5"
              >
                <it.icon className="h-4 w-4 text-ink-soft" />
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

function DueDateEditor({ installment, onClose }) {
  const { updateInstallmentDueDate } = useLendingMutations()
  const toast = useToast()
  const [value, setValue] = useState(installment.due_date)
  const save = async () => {
    try {
      await updateInstallmentDueDate.mutateAsync({ installmentId: installment.id, dueDate: value })
      toast.success('Due date updated.')
      onClose()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }
  return (
    <Modal open onClose={onClose} title={`Installment #${installment.installment_number} — due date`} size="sm">
      <Field label="Due date">
        <TextInput type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save} disabled={updateInstallmentDueDate.isPending}>
          Save
        </button>
      </div>
    </Modal>
  )
}

// --- one installment row --------------------------------------------------
function InstallmentRow({ inst, isLast, open, onToggle, settled, onRecordPayment, onEditDue }) {
  const st = installmentLiveStatus(inst)
  const tk = tokens(st.key)
  const { DotIcon } = tk
  const scheduled = Number(inst.scheduled_amount)
  const paid = Number(inst.paid_amount)
  const remaining = Number(inst.outstanding_amount)
  const pct = scheduled > 0 ? Math.round((paid / scheduled) * 100) : 0
  const isPaid = st.key === 'paid'
  const canPay = !settled && remaining > 0.005

  const day = formatDate(inst.due_date, 'dd')
  const monYr = formatDate(inst.due_date, 'MMM yyyy')

  const cardTone =
    st.key === 'due' || st.key === 'due_soon' || st.key === 'partially_paid'
      ? 'border-warning/30 bg-warning/[0.04]'
      : st.key === 'overdue'
        ? 'border-danger/30 bg-danger/[0.04]'
        : 'border-line dark:border-white/10'

  return (
    <li className="flex gap-3">
      {/* rail */}
      <div className="flex flex-col items-center pt-4">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${tk.dot}`}>
          <DotIcon className="h-4 w-4" strokeWidth={2.5} />
        </span>
        {!isLast && <span className="my-1 w-px flex-1 bg-line dark:bg-white/10" />}
      </div>

      {/* card */}
      <div className={`mb-3 min-w-0 flex-1 rounded-xl border p-3 ${cardTone}`}>
        <div className="flex gap-3">
          {/* date chip */}
          <button
            onClick={onToggle}
            className={`relative flex w-16 shrink-0 flex-col items-center rounded-lg px-1.5 py-2 text-center ${tk.chip}`}
          >
            <Link2 className="absolute right-1 top-1 h-3 w-3 opacity-40" />
            <span className="text-[10px] font-bold leading-none">#{inst.installment_number}</span>
            <span className="mt-1 text-lg font-extrabold leading-none">{day}</span>
            <span className="mt-0.5 text-[10px] font-medium leading-tight opacity-80">{monYr}</span>
          </button>

          {/* body */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
              <div className="min-w-[104px]">
                <p className="text-base font-bold">{formatCurrency(scheduled)}</p>
                <p className="text-[11px] text-ink-soft">Scheduled amount</p>
              </div>

              {open && (
                <>
                  <div>
                    <p className="text-[11px] text-ink-soft">Paid</p>
                    <p className="text-sm font-semibold text-success">{formatCurrency(paid)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-soft">Remaining</p>
                    <p className={`text-sm font-semibold ${remaining > 0.005 ? 'text-warning' : 'text-ink-soft'}`}>
                      {formatCurrency(remaining)}
                    </p>
                  </div>
                </>
              )}

              <div className="ml-auto flex items-start gap-1.5">
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tk.badge}`}>
                    {st.label}
                  </span>
                  <p className={`mt-1 text-[11px] font-medium ${tk.num}`}>{pct}%</p>
                </div>
                <RowMenu
                  items={[
                    ...(canPay ? [{ label: 'Record payment', icon: Plus, onClick: () => onRecordPayment(inst) }] : []),
                    { label: 'Edit due date', icon: Pencil, onClick: () => onEditDue(inst) },
                  ]}
                />
              </div>
            </div>

            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-400/15 dark:bg-white/10">
              <div className={`h-full rounded-full ${tk.bar}`} style={{ width: `${Math.max(pct, 0)}%` }} />
            </div>

            {open && !isPaid && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 dark:border-white/10">
                <span className={`inline-flex items-center gap-1.5 text-xs ${tk.num}`}>
                  <Calendar className="h-3.5 w-3.5" /> Due on {formatDate(inst.due_date, 'dd MMM yyyy')}
                </span>
                {canPay && (
                  <button
                    onClick={() => onRecordPayment(inst)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition
                      ${st.key === 'overdue' ? 'border-danger/40 text-danger hover:bg-danger/10' : 'border-warning/40 text-warning hover:bg-warning/10'}`}
                  >
                    <Plus className="h-3.5 w-3.5" /> Record payment
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

const LEGEND = [
  ['bg-success', 'Paid'],
  ['bg-warning', 'Due Soon'],
  ['bg-danger', 'Overdue'],
  ['bg-info', 'Upcoming'],
]

export default function InstallmentSchedule({ record, onRecordPayment }) {
  const installments = record.installments ?? []
  const [editing, setEditing] = useState(null)
  const [expandAll, setExpandAll] = useState(true)
  const [overrides, setOverrides] = useState({})
  const settled = ['cancelled', 'written_off'].includes(record.status)

  if (!record.schedule_generated || installments.length === 0) return null

  const rowOpen = (id) => overrides[id] ?? expandAll
  const toggleRow = (id) => setOverrides((p) => ({ ...p, [id]: !(p[id] ?? expandAll) }))
  const toggleAll = () => {
    setExpandAll((v) => !v)
    setOverrides({})
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Repayment schedule</h2>
          <span className="rounded-full bg-success/12 px-2 py-0.5 text-xs font-medium text-success">
            {installments.length} installments
          </span>
        </div>
        <button className="btn-ghost !py-1.5 text-xs" onClick={toggleAll}>
          {expandAll ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {expandAll ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <ol className="space-y-0">
        {installments.map((inst, idx) => (
          <InstallmentRow
            key={inst.id}
            inst={inst}
            isLast={idx === installments.length - 1}
            open={rowOpen(inst.id)}
            onToggle={() => toggleRow(inst.id)}
            settled={settled}
            onRecordPayment={onRecordPayment}
            onEditDue={setEditing}
          />
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 dark:border-white/10">
        <div className="flex flex-wrap gap-4">
          {LEGEND.map(([c, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
              <span className={`h-2.5 w-2.5 rounded-full ${c}`} />
              {label}
            </span>
          ))}
        </div>
        <span className="rounded-full bg-brand-400/10 px-2.5 py-1 text-xs text-ink-soft">
          Total installments: {installments.length}
        </span>
      </div>

      {editing && <DueDateEditor installment={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
