import { Sparkles, Check } from 'lucide-react'
import Modal from '../../../components/common/Modal'
import { usePlans } from '../hooks/useSubscription'
import { useSubscriptionMutations } from '../hooks/useSubscriptionMutations'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatCurrency } from '../../../utils/format'
import { FEATURE_LABEL } from '../subscriptionMeta'

/**
 * The single upgrade prompt used everywhere in the app (limit reached, a
 * Pro-only feature, the plan badge, …). Pricing/feature copy always comes
 * from the Pro plan row — never hardcoded here.
 */
export default function UpgradeModal({ open, onClose, title = 'Unlock more with Pro', description }) {
  const { data: plans } = usePlans()
  const pro = plans?.find((p) => p.slug === 'pro')
  const { checkout } = useSubscriptionMutations()
  const toast = useToast()

  const proFeatures = pro
    ? Object.entries(pro.features ?? {})
        .filter(([, enabled]) => enabled)
        .map(([key]) => FEATURE_LABEL[key] ?? key)
    : []

  const onUpgrade = async () => {
    try {
      const res = await checkout.mutateAsync({ planSlug: 'pro', billingCycle: 'monthly' })
      if (res.status === 'checkout') return
      toast.info(res.message ?? 'Payments are not set up yet.')
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to start checkout right now.'))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upgrade to Pro" size="sm">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-dark to-brand-700 text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">Pro feature</p>
        <h3 className="mt-1 text-lg font-bold">{title}</h3>
        {description && <p className="mt-1.5 text-sm text-ink-soft">{description}</p>}
      </div>

      {proFeatures.length > 0 && (
        <ul className="mt-5 space-y-2">
          {[
            'Unlimited accounts, transactions & budgets',
            'Unlimited bills, EMIs & lending records',
            ...proFeatures,
          ].map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-sm">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              {f}
            </li>
          ))}
        </ul>
      )}

      {pro && (
        <p className="mt-5 text-center">
          <span className="text-2xl font-bold">{formatCurrency(pro.price_monthly)}</span>
          <span className="text-sm text-ink-soft">/month</span>
        </p>
      )}

      <div className="mt-5 space-y-2">
        <button className="btn-primary w-full justify-center" onClick={onUpgrade} disabled={checkout.isPending}>
          {checkout.isPending ? 'Starting checkout…' : 'Upgrade to Pro'}
        </button>
        <button className="btn-ghost w-full justify-center" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </Modal>
  )
}
