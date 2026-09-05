import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import Modal from '../../../components/common/Modal'
import { MoneyInput } from '../../../components/common/form'
import { FEATURE_LABEL, RESOURCE_LABEL } from '../../subscription/subscriptionMeta'

const RESOURCE_KEYS = ['accounts', 'transactions_per_month', 'budgets', 'bills', 'lending_records']
const FEATURE_KEYS = Object.keys(FEATURE_LABEL)

/**
 * Structured plan editor — every control maps to one field in
 * subscription_plans (features/limits jsonb included) so the admin never
 * hand-edits raw JSON. Saving never touches user_subscriptions, so nobody's
 * billing history or currently-locked-in price changes.
 */
export default function PlanEditorModal({ open, onClose, plan, onSubmit, loading }) {
  const { register, handleSubmit, reset, watch, setValue } = useForm({ defaultValues: {} })

  useEffect(() => {
    if (!plan) return
    reset({
      name: plan.name,
      description: plan.description ?? '',
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly,
      currency: plan.currency ?? 'INR',
      is_active: plan.is_active,
      ...Object.fromEntries(FEATURE_KEYS.map((k) => [`feature_${k}`, Boolean(plan.features?.[k])])),
      ...Object.fromEntries(
        RESOURCE_KEYS.map((k) => {
          const raw = plan.limits?.[k]
          const unlimited = raw == null || Number(raw) === -1
          return [`limit_${k}`, unlimited ? '' : raw]
        }),
      ),
      ...Object.fromEntries(RESOURCE_KEYS.map((k) => [`unlimited_${k}`, plan.limits?.[k] == null || Number(plan.limits?.[k]) === -1])),
    })
  }, [plan, reset])

  if (!plan) return null

  const onValid = (v) => {
    onSubmit({
      id: plan.id,
      name: v.name,
      description: v.description,
      price_monthly: Number(v.price_monthly) || 0,
      price_yearly: Number(v.price_yearly) || 0,
      currency: v.currency,
      is_active: Boolean(v.is_active),
      sort_order: plan.sort_order ?? 0,
      features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, Boolean(v[`feature_${k}`])])),
      limits: Object.fromEntries(RESOURCE_KEYS.map((k) => [k, v[`unlimited_${k}`] ? -1 : Number(v[`limit_${k}`]) || 0])),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${plan.name}`} size="lg">
      <form onSubmit={handleSubmit(onValid)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" {...register('name')} />
          </div>
          <div>
            <label className="label">Currency</label>
            <select className="input" {...register('currency')}>
              <option value="INR">INR — ₹</option>
              <option value="USD">USD — $</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea className="input resize-y" rows={2} {...register('description')} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Monthly price</label>
            <MoneyInput {...register('price_monthly')} />
          </div>
          <div>
            <label className="label">Yearly price</label>
            <MoneyInput {...register('price_yearly')} />
          </div>
        </div>

        <div>
          <p className="label mb-2">Features</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURE_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm dark:border-white/10">
                <input type="checkbox" className="h-4 w-4" {...register(`feature_${key}`)} />
                {FEATURE_LABEL[key]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="label mb-2">Limits</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {RESOURCE_KEYS.map((key) => {
              const unlimited = watch(`unlimited_${key}`)
              return (
                <div key={key} className="rounded-xl border border-line p-3 dark:border-white/10">
                  <p className="mb-1.5 text-xs font-semibold text-ink-soft">{RESOURCE_LABEL[key]}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      className="input h-9"
                      disabled={unlimited}
                      placeholder={unlimited ? 'Unlimited' : '0'}
                      {...register(`limit_${key}`)}
                    />
                    <label className="flex shrink-0 items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={Boolean(unlimited)}
                        onChange={(e) => setValue(`unlimited_${key}`, e.target.checked, { shouldDirty: true })}
                      />
                      Unlimited
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-line p-3 text-sm dark:border-white/10">
          <span>
            <span className="font-medium">Active</span>
            <span className="block text-xs text-ink-soft">Inactive plans are hidden from Pricing and can&apos;t be selected.</span>
          </span>
          <input type="checkbox" className="h-4 w-4" {...register('is_active')} />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
