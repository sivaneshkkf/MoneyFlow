import { useState } from 'react'
import { Ban, Trash2 } from 'lucide-react'
import Modal from '../../components/common/Modal'

/**
 * Deleting a lending record that has repayment history is ambiguous, same
 * as Bills & Recurring (see DeletePaymentDialog.jsx): write it off (keep
 * every repayment + its interest income, just stop tracking it as active)
 * or genuinely delete everything, repayments included. Ask instead of only
 * offering the destructive path.
 *
 * delete_lending_record() already reverses cash correctly and ONLY for real
 * repayments — it walks the `lending_repayments` table, which "Already
 * paid" backdated installments never create a row in — so "Delete
 * everything" here has always been safe; this just adds the missing choice.
 */
export default function DeleteLendingDialog({ open, onClose, onWriteOff, onDeleteAll, loading }) {
  const [confirmingHard, setConfirmingHard] = useState(false)

  const close = () => {
    setConfirmingHard(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Delete this lending record?" size="sm">
      {!confirmingHard ? (
        <>
          <p className="text-sm text-ink-soft">This loan has recorded repayments. Choose what to do with it:</p>
          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={onWriteOff}
              disabled={loading}
              className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5"
            >
              <Ban className="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-brand-400" />
              <span>
                <span className="block text-sm font-semibold">Write off (keep history)</span>
                <span className="block text-xs text-ink-soft">
                  Marks it settled and stops tracking it as active. Every repayment already recorded — and its
                  interest income — stays exactly as-is.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmingHard(true)}
              disabled={loading}
              className="flex w-full items-start gap-3 rounded-xl border border-danger/30 p-3 text-left transition hover:bg-danger/5 disabled:opacity-60"
            >
              <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <span>
                <span className="block text-sm font-semibold text-danger">Delete everything</span>
                <span className="block text-xs text-ink-soft">
                  Removes the record, its repayments and installment schedule. The principal lent is returned to the
                  source account, repayments received are taken back out, and any interest income is removed. This
                  cannot be undone.
                </span>
              </span>
            </button>
          </div>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={close} disabled={loading}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            This permanently deletes every recorded repayment on this loan and reverses every cash movement it made.
            There is no undo. Are you sure?
          </p>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setConfirmingHard(false)} disabled={loading}>
              Back
            </button>
            <button className="btn bg-danger text-white hover:bg-danger/90" onClick={onDeleteAll} disabled={loading}>
              {loading ? 'Deleting…' : 'Yes, delete everything'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
