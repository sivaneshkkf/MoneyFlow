import { useState } from 'react'
import Modal from '../../../components/common/Modal'

/**
 * ConfirmDialog + an optional admin reason, for the sensitive actions that
 * should be explainable later from the audit log (suspend, cancel, plan
 * change, role grant/revoke). Mirrors ConfirmDialog's own button styling.
 */
export default function ConfirmAdminAction({
  open, onClose, onConfirm, title = 'Are you sure?', message, confirmLabel = 'Confirm',
  tone = 'danger', loading = false, requireReason = false,
}) {
  const [reason, setReason] = useState('')

  const close = () => {
    setReason('')
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title={title} size="sm">
      {message && <p className="text-sm text-ink-soft">{message}</p>}
      <div className="mt-3">
        <label className="label" htmlFor="admin-action-reason">
          Reason {requireReason ? '' : '(optional)'}
        </label>
        <textarea
          id="admin-action-reason"
          className="input resize-y"
          rows={2}
          placeholder="e.g. Customer requested upgrade"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={close} disabled={loading}>
          Cancel
        </button>
        <button
          className={tone === 'danger' ? 'btn bg-danger text-white hover:bg-danger/90' : 'btn-primary'}
          onClick={() => onConfirm(reason.trim() || null)}
          disabled={loading || (requireReason && !reason.trim())}
        >
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
