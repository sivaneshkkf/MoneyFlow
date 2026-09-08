import { useState } from 'react'
import { Archive, Trash2 } from 'lucide-react'
import Modal from '../../components/common/Modal'

/**
 * Deleting a bill/EMI that has recorded payment history is ambiguous:
 * archive it (keep every paid installment + its transactions, just stop the
 * schedule) or genuinely delete everything, paid history included. Rather
 * than silently picking one, ask — see delete_recurring_payment()'s p_hard
 * for exactly what each option does server-side.
 */
export default function DeletePaymentDialog({ open, onClose, onArchive, onDeleteAll, loading }) {
  // Guards the destructive option behind one extra tap so it's never hit by
  // the same reflexive click that dismisses a plain confirm dialog.
  const [confirmingHard, setConfirmingHard] = useState(false)

  const close = () => {
    setConfirmingHard(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Delete this payment?" size="sm">
      {!confirmingHard ? (
        <>
          <p className="text-sm text-ink-soft">
            This payment has recorded history. Choose what to do with it:
          </p>
          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={onArchive}
              disabled={loading}
              className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5"
            >
              <Archive className="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-brand-400" />
              <span>
                <span className="block text-sm font-semibold">Archive (keep payment history)</span>
                <span className="block text-xs text-ink-soft">
                  Stops the schedule and hides it from active payments. Every payment already recorded — and its
                  transactions — stays exactly as-is.
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
                  Removes the payment, its schedule and every recorded payment. Any account balance those payments
                  affected is restored. This cannot be undone.
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
            This permanently deletes every recorded payment on this item and restores any account balance they
            affected. There is no undo. Are you sure?
          </p>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setConfirmingHard(false)} disabled={loading}>
              Back
            </button>
            <button
              className="btn bg-danger text-white hover:bg-danger/90"
              onClick={onDeleteAll}
              disabled={loading}
            >
              {loading ? 'Deleting…' : 'Yes, delete everything'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
