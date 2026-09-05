import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Trash2, Pause, Play, SkipForward, Zap, Bell, CircleCheck,
} from 'lucide-react'
import { PageContainer, Badge, Skeleton, ErrorState, ProgressBar } from '../../components/common'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import CategoryIcon from '../../components/categories/CategoryIcon'
import { formatCurrency, formatDate } from '../../utils/format'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { useRecurringPayment, useBillMutations } from './useBills'
import BillForm from './BillForm'
import PaymentForm from './PaymentForm'
import { kindMeta, frequencyLabel, occurrenceDueLabel, OCC_STATUS_META } from './billMeta'

export default function BillDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: rec, isLoading, isError, refetch } = useRecurringPayment(id)
  const { setStatus, remove, skip } = useBillMutations()

  const [editOpen, setEditOpen] = useState(false)
  const [payOcc, setPayOcc] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const paidOcc = useMemo(() => (rec?.occurrences ?? []).filter((o) => o.status === 'paid'), [rec])
  const openOcc = useMemo(
    () => (rec?.occurrences ?? []).filter((o) => ['upcoming', 'due', 'overdue'].includes(o.status)),
    [rec],
  )
  const nextOcc = openOcc[0] ?? null

  if (isLoading) return <PageContainer><Skeleton className="h-96 w-full" /></PageContainer>
  if (isError || !rec)
    return (
      <PageContainer>
        <ErrorState message="Unable to load this payment." onRetry={refetch} />
      </PageContainer>
    )

  const meta = kindMeta(rec.kind)
  const isEmi = rec.kind === 'emi'
  const lia = rec.liability
  const paused = rec.status === 'paused'
  const ended = rec.status === 'ended'

  const act = async (fn, msg) => {
    try {
      await fn()
      toast.success(msg)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const progress = isEmi && lia?.installments_total
    ? Math.min(100, (lia.installments_paid / lia.installments_total) * 100)
    : 0

  return (
    <PageContainer>
      <Link to="/bills" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to Bills &amp; Recurring
      </Link>

      <div className="card mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
              style={{ background: `${rec.category?.color ?? meta.color}1f`, color: rec.category?.color ?? meta.color }}
            >
              {rec.category?.icon ? <CategoryIcon name={rec.category.icon} size={22} /> : <meta.icon className="h-6 w-6" />}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold">{rec.displayName}</h1>
                <Badge tone="neutral">{meta.label}</Badge>
                {paused && <Badge tone="warning">Paused</Badge>}
                {ended && <Badge tone="neutral">Ended</Badge>}
                {rec.autopay && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                    <Zap className="h-3 w-3" /> Autopay
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {formatCurrency(rec.amount)} · {frequencyLabel(rec.frequency)}
                {rec.merchant_name ? ` · ${rec.merchant_name}` : ''}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                <Bell className="h-3 w-3" />
                {rec.reminder_days_before === 0 ? 'Remind on due date' : `Remind ${rec.reminder_days_before} days before`}
                {rec.account?.name ? ` · ${rec.account.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {nextOcc && !ended && (
              <button className="btn-primary" onClick={() => setPayOcc(nextOcc)}>
                <CircleCheck className="h-4 w-4" /> Mark as paid
              </button>
            )}
            <button className="btn-ghost" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
            {!ended && (
              <button
                className="btn-ghost"
                onClick={() =>
                  act(
                    () => setStatus.mutateAsync({ id: rec.id, status: paused ? 'active' : 'paused' }),
                    paused ? 'Resumed.' : 'Paused.',
                  )
                }
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused ? 'Resume' : 'Pause'}
              </button>
            )}
            {nextOcc && !ended && (
              <button
                className="btn-ghost"
                onClick={() => act(() => skip.mutateAsync(nextOcc.id), 'Next payment skipped.')}
              >
                <SkipForward className="h-4 w-4" /> Skip next
              </button>
            )}
            <button className="btn bg-danger text-white hover:bg-danger/90" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>

        {isEmi && lia && (
          <>
            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Original principal', formatCurrency(lia.original_principal)],
                ['Outstanding principal', formatCurrency(lia.outstanding_principal)],
                ['Principal paid', formatCurrency(lia.principal_paid)],
                ['Interest paid', formatCurrency(lia.interest_paid)],
                ['Next EMI', nextOcc ? formatCurrency(nextOcc.scheduled_amount) : '—'],
                ['Next due', nextOcc ? formatDate(nextOcc.due_date) : '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-soft">{k}</dt>
                  <dd className="text-base font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-ink-soft">
                <span>
                  {lia.installments_paid} / {lia.installments_total} installments
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <ProgressBar value={progress} tone="success" />
            </div>
          </>
        )}

        {rec.notes && <p className="mt-4 text-sm"><span className="text-ink-soft">Notes: </span>{rec.notes}</p>}
      </div>

      {/* Schedule */}
      <div className="card mb-6 p-5">
        <h2 className="mb-4 text-base font-semibold">{isEmi ? 'Payment schedule' : 'Upcoming occurrences'}</h2>
        {openOcc.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">No upcoming payments.</p>
        ) : (
          <ul className="divide-y divide-line dark:divide-white/5">
            {openOcc.slice(0, 24).map((o) => {
              const due = occurrenceDueLabel(o.due_date, o.status)
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {o.installment_number ? `#${o.installment_number} · ` : ''}
                      {formatDate(o.due_date)}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {formatCurrency(o.scheduled_amount)}
                      {isEmi
                        ? ` · principal ${formatCurrency(o.principal_amount)} · interest ${formatCurrency(o.interest_amount)}`
                        : ''}
                    </p>
                  </div>
                  {due && <Badge tone={due.tone}>{due.text}</Badge>}
                  {!ended && (
                    <button className="btn-primary !py-1.5 text-xs" onClick={() => setPayOcc(o)}>
                      Mark as paid
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* History */}
      <div className="card p-5">
        <h2 className="mb-4 text-base font-semibold">Payment history</h2>
        {paidOcc.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-soft">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Amount</th>
                  {isEmi && <th className="pb-2 pr-3 font-medium">Principal / Interest</th>}
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-white/5">
                {paidOcc.map((o) => {
                  const sm = OCC_STATUS_META[o.status]
                  const inner = (
                    <>
                      <td className="py-2.5 pr-3">{formatDate(o.paid_at ?? o.due_date)}</td>
                      <td className="py-2.5 pr-3 font-semibold">{formatCurrency(o.paid_amount)}</td>
                      {isEmi && (
                        <td className="py-2.5 pr-3 text-xs text-ink-soft">
                          {formatCurrency(o.principal_amount)} / {formatCurrency(o.interest_amount)}
                        </td>
                      )}
                      <td className="py-2.5">
                        <Badge tone={sm.tone}>{sm.label}</Badge>
                      </td>
                    </>
                  )
                  return o.transaction?.id ? (
                    <tr
                      key={o.id}
                      className="cursor-pointer transition hover:bg-brand-50/60 dark:hover:bg-white/5"
                      onClick={() => navigate(`/transactions?highlight=${o.transaction.id}`)}
                    >
                      {inner}
                    </tr>
                  ) : (
                    <tr key={o.id}>{inner}</tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit payment" size="lg">
        <BillForm initial={rec} onDone={() => setEditOpen(false)} />
      </Modal>
      <Modal open={Boolean(payOcc)} onClose={() => setPayOcc(null)} title="Record payment">
        {payOcc && <PaymentForm occurrence={payOcc} recurring={rec} onDone={() => setPayOcc(null)} />}
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          // hard delete when there is no payment history; the RPC falls back to
          // archiving (status = 'ended') automatically if any payment exists.
          act(() => remove.mutateAsync({ id: rec.id, hard: true }), 'Recurring payment deleted.').then(() =>
            navigate('/bills'),
          )
        }
        title="Delete recurring payment?"
        message={
          paidOcc.length > 0
            ? 'This payment has recorded history, so it will be archived (marked Ended). Every payment you already recorded stays in your transactions.'
            : 'This removes the payment and its whole schedule. Nothing has been paid yet, so there is nothing to keep.'
        }
        confirmLabel="Delete"
        loading={remove.isPending}
      />
    </PageContainer>
  )
}
