import { useForm } from 'react-hook-form'
import Modal from '../../../components/common/Modal'
import { Field, Textarea, MoneyInput } from '../../../components/common/form'
import { useCustomPlanMutations } from '../hooks/useCustomPlan'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'

export default function RequestCustomPlanModal({ open, onClose }) {
  const { request } = useCustomPlanMutations()
  const toast = useToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: { billing_cycle: 'monthly', requested_price: '', description: '', additional_requirements: '' },
  })

  const onSubmit = async (v) => {
    if (!v.description.trim()) return
    try {
      await request.mutateAsync({
        billingCycle: v.billing_cycle,
        requestedPrice: v.requested_price ? Number(v.requested_price) : null,
        description: v.description.trim(),
        additionalRequirements: v.additional_requirements.trim() || null,
      })
      toast.success("Request sent — we'll get back to you with an offer soon.")
      reset()
      onClose()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Request a custom plan" size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-ink-soft">
          Tell us what you need and, optionally, what you&apos;d be happy to pay — we&apos;ll come back with an offer.
        </p>

        <Field label="What do you need?">
          <Textarea {...register('description')} rows={3} placeholder="e.g. I need higher limits but not everything in Pro." autoFocus />
        </Field>

        <Field label="Anything else? (optional)">
          <Textarea {...register('additional_requirements')} rows={2} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your budget (optional)">
            <MoneyInput {...register('requested_price')} placeholder="₹" />
          </Field>
          <Field label="Billing">
            <select className="input" {...register('billing_cycle')}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </Field>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Request Quote'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
