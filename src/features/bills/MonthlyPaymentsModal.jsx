import { CircleCheck } from 'lucide-react'
import Modal from '../../components/common/Modal'
import { Badge } from '../../components/common'
import { formatCurrency, formatDate } from '../../utils/format'
import { occurrenceDueLabel } from './billMeta'

/**
 * The full list behind a grouped "This month's payments" card (see
 * BillsPage.jsx) — every occurrence for one recurring definition this
 * month, pending and paid, each with its own Mark as paid action. This is
 * what a daily (or any high-frequency) item's dozens of occurrences fold
 * into instead of flooding the summary grid with one card each.
 */
export default function MonthlyPaymentsModal({ def, occurrences, onClose, onPay }) {
  return (
    <Modal
      open={Boolean(def)}
      onClose={onClose}
      title={def?.displayName}
      description={def ? `${occurrences.length} payment${occurrences.length === 1 ? '' : 's'} this month` : undefined}
      size="md"
    >
      {def && (
        <ul className="divide-y divide-line dark:divide-white/5">
          {occurrences.map((o) => {
            const isPaid = o.status === 'paid'
            const due = occurrenceDueLabel(o.due_date, o.status)
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{isPaid ? `Paid ${formatDate(o.paid_at)}` : formatDate(o.due_date)}</p>
                  <p className="text-xs text-ink-soft">
                    {formatCurrency(isPaid ? o.paid_amount || o.scheduled_amount : o.scheduled_amount)}
                  </p>
                </div>
                {isPaid ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success">
                    <CircleCheck className="h-3.5 w-3.5" /> Paid
                  </span>
                ) : (
                  <>
                    {due && <Badge tone={due.tone}>{due.text}</Badge>}
                    <button className="btn-primary !py-1.5 text-xs" onClick={() => onPay(o)}>
                      Mark as paid
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
