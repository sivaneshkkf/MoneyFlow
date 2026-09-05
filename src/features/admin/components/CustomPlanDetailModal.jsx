import { useState } from 'react'
import { Pencil, Ban, Check, X as XIcon } from 'lucide-react'
import Modal from '../../../components/common/Modal'
import ConfirmAdminAction from './ConfirmAdminAction'
import { Skeleton, Badge } from '../../../components/common'
import { formatCurrency, formatDate } from '../../../utils/format'
import { CUSTOM_PLAN_STATUS_META, OFFER_SOURCE_META } from '../../subscription/customPlanMeta'
import { useAdminCustomPlanRequestDetail, useAdminCustomPlanMutations } from '../hooks/useAdminCustomPlans'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import CustomOfferFormModal from './CustomOfferFormModal'

export default function CustomPlanDetailModal({ id, onClose }) {
  const { data: req, isLoading } = useAdminCustomPlanRequestDetail(id)
  const { respond, reject, updateOffer, cancelOffer } = useAdminCustomPlanMutations()
  const toast = useToast()
  const [action, setAction] = useState(null) // 'reject' | 'cancel'
  const [formMode, setFormMode] = useState(null) // 'respond' | 'edit'

  const act = async (fn, msg) => {
    try {
      await fn()
      toast.success(msg)
      setAction(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const submitForm = async (payload) => {
    try {
      if (formMode === 'respond') {
        await respond.mutateAsync({
          id: req.id, adminPrice: payload.adminPrice, billingCycle: payload.billingCycle,
          adminMessage: payload.adminMessage, validUntil: payload.validUntil,
        })
        toast.success('Offer sent.')
      } else {
        await updateOffer.mutateAsync({
          id: req.id, adminPrice: payload.adminPrice, adminMessage: payload.adminMessage, validUntil: payload.validUntil,
        })
        toast.success('Offer updated.')
      }
      setFormMode(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <Modal open={Boolean(id)} onClose={onClose} title="Custom plan" size="md">
      {isLoading || !req ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm text-ink-soft">Customer</p>
              <p className="font-semibold">{req.full_name || req.email}</p>
            </div>
            <div className="flex gap-1.5">
              <Badge tone={OFFER_SOURCE_META[req.offer_source]?.tone ?? 'neutral'}>
                {OFFER_SOURCE_META[req.offer_source]?.label ?? req.offer_source}
              </Badge>
              <Badge tone={CUSTOM_PLAN_STATUS_META[req.status]?.tone ?? 'neutral'}>
                {CUSTOM_PLAN_STATUS_META[req.status]?.label ?? req.status}
              </Badge>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            {req.offer_source === 'user_request' && (
              <div>
                <dt className="text-xs text-ink-soft">Requested Price</dt>
                <dd className="font-semibold">
                  {req.requested_price != null ? `${formatCurrency(req.requested_price)}/${req.billing_cycle}` : '—'}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-ink-soft">Offer Price</dt>
              <dd className="font-semibold">
                {req.admin_price != null ? `${formatCurrency(req.admin_price)}/${req.billing_cycle}` : 'Not set yet'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Valid Until</dt>
              <dd className="font-semibold">{req.valid_until ? formatDate(req.valid_until) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Created</dt>
              <dd className="font-semibold">{formatDate(req.created_at)}</dd>
            </div>
          </dl>

          {req.description && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Description</p>
              <p className="mt-1 text-sm">{req.description}</p>
            </div>
          )}
          {req.additional_requirements && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Additional requirements</p>
              <p className="mt-1 text-sm">{req.additional_requirements}</p>
            </div>
          )}
          {req.admin_message && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Admin message</p>
              <p className="mt-1 text-sm">{req.admin_message}</p>
            </div>
          )}

          <div className="modal-actions">
            {['pending', 'reviewing'].includes(req.status) && (
              <>
                <button className="btn bg-danger text-white hover:bg-danger/90" onClick={() => setAction('reject')}>
                  <XIcon className="h-4 w-4" /> Reject
                </button>
                <button className="btn-primary" onClick={() => setFormMode('respond')}>
                  <Check className="h-4 w-4" /> Respond
                </button>
              </>
            )}
            {req.status === 'offered' && (
              <>
                <button className="btn bg-danger text-white hover:bg-danger/90" onClick={() => setAction('cancel')}>
                  <Ban className="h-4 w-4" /> Cancel Offer
                </button>
                <button className="btn-primary" onClick={() => setFormMode('edit')}>
                  <Pencil className="h-4 w-4" /> Edit Offer
                </button>
              </>
            )}
            {req.status === 'payment_pending' && (
              <button className="btn bg-danger text-white hover:bg-danger/90" onClick={() => setAction('cancel')}>
                <Ban className="h-4 w-4" /> Cancel Offer
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmAdminAction
        open={action === 'reject'}
        onClose={() => setAction(null)}
        loading={reject.isPending}
        title="Reject this request?"
        message="The customer will be notified that no offer will be made for this request."
        confirmLabel="Reject request"
        onConfirm={(reason) => act(() => reject.mutateAsync({ id: req.id, reason }), 'Request rejected.')}
      />
      <ConfirmAdminAction
        open={action === 'cancel'}
        onClose={() => setAction(null)}
        loading={cancelOffer.isPending}
        title={`Cancel this custom offer for ${req?.full_name || req?.email}?`}
        message="The customer will no longer be able to accept or pay for this offer."
        confirmLabel="Cancel offer"
        onConfirm={(reason) => act(() => cancelOffer.mutateAsync({ id: req.id, reason }), 'Offer cancelled.')}
      />
      {req && (
        <CustomOfferFormModal
          open={Boolean(formMode)}
          onClose={() => setFormMode(null)}
          mode={formMode}
          request={req}
          loading={respond.isPending || updateOffer.isPending}
          onSubmit={submitForm}
        />
      )}
    </Modal>
  )
}
