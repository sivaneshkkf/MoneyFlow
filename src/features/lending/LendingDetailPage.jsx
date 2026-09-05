import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  Ban,
} from 'lucide-react'
import { PageContainer, Badge, Skeleton, ErrorState } from '../../components/common'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { useLendingRecord, useLendingMutations, useRefreshLendingStatus } from './useLending'
import LendingForm from './LendingForm'
import RepaymentForm from './RepaymentForm'
import InstallmentSchedule from './InstallmentSchedule'
import { loanScheduleSummary } from './schedule'
import { STATUS_META } from './status'
import { formatCurrency, formatDate } from '../../utils/format'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

export default function LendingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  useRefreshLendingStatus()
  const { data: record, isLoading, isError, refetch } = useLendingRecord(id)
  const { update, remove, deleteRepayment } = useLendingMutations()

  const [editOpen, setEditOpen] = useState(false)
  const [repayOpen, setRepayOpen] = useState(false)
  const [repayPrefill, setRepayPrefill] = useState(null)
  const [deleteRec, setDeleteRec] = useState(false)
  const [delRepay, setDelRepay] = useState(null)

  if (isLoading) return <PageContainer><Skeleton className="h-96 w-full" /></PageContainer>
  if (isError || !record)
    return (
      <PageContainer>
        <ErrorState message="Unable to load this lending record." onRetry={refetch} />
      </PageContainer>
    )

  const meta = STATUS_META[record.status]
  const sched = loanScheduleSummary(record, record.installments)
  const settled = ['fully_paid', 'cancelled', 'written_off'].includes(record.status)

  const openRepay = (prefill = null) => {
    setRepayPrefill(prefill)
    setRepayOpen(true)
  }

  const act = async (fn, msg) => {
    try {
      await fn()
      toast.success(msg)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <PageContainer>
      <Link to="/lending/given" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to Money Lent
      </Link>

      <div className="card mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{record.borrower_name}</h1>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {sched.label && <Badge tone={sched.tone}>{sched.label}</Badge>}
              {sched.overdueCount > 0 && (
                <Badge tone="danger">{formatCurrency(sched.overdueAmount)} overdue</Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-ink-soft">
              {record.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{record.phone}</span>}
              {record.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{record.email}</span>}
              {record.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{record.address}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!settled && (
              <button className="btn-primary" onClick={() => openRepay()}>
                <Plus className="h-4 w-4" /> Record repayment
              </button>
            )}
            <button className="btn-ghost" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
            {!settled && (
              <button
                className="btn-ghost"
                onClick={() =>
                  act(
                    () => update.mutateAsync({ id: record.id, status: 'written_off' }),
                    'Marked as written off.',
                  )
                }
              >
                <Ban className="h-4 w-4" /> Write off
              </button>
            )}
            <button className="btn bg-danger text-white hover:bg-danger/90" onClick={() => setDeleteRec(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Total Loan', formatCurrency(sched.total), 'text-ink'],
            ['Paid', formatCurrency(sched.paid), 'text-success'],
            ['Outstanding', formatCurrency(sched.outstanding), 'text-warning'],
            ['Overdue', formatCurrency(sched.overdueAmount), sched.overdueAmount > 0 ? 'text-danger' : 'text-ink'],
            ['Upcoming', formatCurrency(sched.upcomingAmount), 'text-ink'],
            ['Next Due', sched.nextDueDate ? formatDate(sched.nextDueDate) : '—', 'text-ink'],
          ].map(([k, v, tone]) => (
            <div key={k}>
              <dt className="text-xs text-ink-soft">{k}</dt>
              <dd className={`text-base font-bold ${tone}`}>{v}</dd>
            </div>
          ))}
        </dl>

        {sched.nextDueDate && !settled && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-white/5">
            <span>
              <span className="text-ink-soft">Next payment: </span>
              <b>{formatCurrency(sched.nextDueAmount)}</b>
              <span className="text-ink-soft"> · {sched.label}</span>
            </span>
            <button
              className="btn-primary !py-1.5 text-xs"
              onClick={() => {
                const next = (record.installments ?? [])
                  .filter((i) => i.status !== 'cancelled' && Number(i.outstanding_amount) > 0.005)
                  .sort((a, b) => a.installment_number - b.installment_number)[0]
                openRepay(
                  next
                    ? {
                        principal: Math.max(0, Number(next.principal_amount) - Number(next.principal_paid)),
                        interest: Math.max(0, Number(next.interest_amount) - Number(next.interest_paid)),
                        dueDate: next.due_date,
                      }
                    : null,
                )
              }}
            >
              Record payment
            </button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-ink-soft sm:grid-cols-4">
          <span>Outstanding principal<br /><b className="text-ink">{formatCurrency(record.outstanding_principal)}</b></span>
          <span>Outstanding interest<br /><b className="text-ink">{formatCurrency(record.outstanding_interest)}</b></span>
          <span>Lending date<br /><b className="text-ink">{formatDate(record.lending_date)}</b></span>
          <span>From account<br /><b className="text-ink">{record.account?.name ?? '—'}</b></span>
        </div>

        {record.purpose && <p className="mt-4 text-sm"><span className="text-ink-soft">Purpose: </span>{record.purpose}</p>}
        {record.notes && <p className="mt-1 text-sm"><span className="text-ink-soft">Notes: </span>{record.notes}</p>}
      </div>

      <div className="mb-6">
        <InstallmentSchedule
          record={record}
          onRecordPayment={(inst) =>
            openRepay({
              principal: Math.max(0, Number(inst.principal_amount) - Number(inst.principal_paid)),
              interest: Math.max(0, Number(inst.interest_amount) - Number(inst.interest_paid)),
              dueDate: inst.due_date,
            })
          }
        />
      </div>

      <div className="card p-5">
        <h2 className="mb-4 text-base font-semibold">Repayment history</h2>
        {record.repayments.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-soft">No repayments recorded yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-line pl-5 dark:border-white/10">
            {record.repayments.map((rp) => (
              <li key={rp.id} className="relative">
                <span className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-success/20">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                </span>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{formatCurrency(rp.amount)}</p>
                    <p className="text-xs text-ink-soft">
                      Principal {formatCurrency(rp.principal_amount)} · Interest {formatCurrency(rp.interest_amount)}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {formatDate(rp.payment_date)}
                      {rp.account?.name ? ` · ${rp.account.name}` : ''}
                      {rp.payment_method?.name ? ` · ${rp.payment_method.name}` : ''}
                    </p>
                    {rp.notes && <p className="mt-0.5 text-xs text-ink-soft">{rp.notes}</p>}
                  </div>
                  <button
                    className="rounded-lg p-1.5 text-ink-soft hover:bg-danger/10 hover:text-danger"
                    onClick={() => setDelRepay(rp)}
                    aria-label="Delete repayment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit lending record" size="lg">
        <LendingForm initial={record} onDone={() => setEditOpen(false)} />
      </Modal>
      <Modal open={repayOpen} onClose={() => setRepayOpen(false)} title="Record repayment">
        <RepaymentForm
          record={record}
          prefill={repayPrefill}
          onDone={() => {
            setRepayOpen(false)
            setRepayPrefill(null)
          }}
        />
      </Modal>

      <ConfirmDialog
        open={deleteRec}
        onClose={() => setDeleteRec(false)}
        onConfirm={() =>
          act(() => remove.mutateAsync(record.id), 'Lending record deleted.').then(() => navigate('/lending/given'))
        }
        title="Delete lending record?"
        message="Removes the record, its repayments and installment schedule. All cash movements are reversed — the principal lent is returned to the source account, repayments received are taken back out of their accounts, and any interest income is removed."
        confirmLabel="Delete"
        loading={remove.isPending}
      />
      <ConfirmDialog
        open={Boolean(delRepay)}
        onClose={() => setDelRepay(null)}
        onConfirm={() =>
          act(() => deleteRepayment.mutateAsync(delRepay.id), 'Repayment removed.').then(() => setDelRepay(null))
        }
        title="Delete this repayment?"
        message="Outstanding balances, account cash and any interest income will be reversed."
        confirmLabel="Delete"
        loading={deleteRepayment.isPending}
      />
    </PageContainer>
  )
}
