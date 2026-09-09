import { Check, Crown, Leaf, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency } from '../../../utils/format'
import { planFeatureList } from '../subscriptionMeta'

const PLAN_ICON = { free: Leaf, pro: Crown }
const PLAN_ICON_STYLE = {
  free: 'bg-ink-soft/10 text-ink-soft',
  pro: 'bg-brand-500/15 text-brand-700 dark:text-brand-400',
}

export default function PricingCard({ plan, billingCycle, isCurrent, onSelect, loading }) {
  const isPro = plan.slug === 'pro'
  const Icon = PLAN_ICON[plan.slug] ?? Sparkles
  const price = billingCycle === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly)
  const period = billingCycle === 'yearly' ? '/year' : '/month'
  const features = planFeatureList(plan)

  return (
    <div
      className={clsx(
        'relative flex h-full flex-col rounded-2xl border p-6 transition',
        isPro
          ? 'border-brand-700/40 bg-gradient-to-b from-brand-50/70 to-white shadow-md dark:from-brand-700/10 dark:to-transparent'
          : 'border-line bg-white dark:border-white/10 dark:bg-[#161F1D]',
      )}
    >
      {isPro && (
        <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-dark px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm dark:bg-brand-700">
          <Crown className="h-3 w-3" /> Most popular
        </span>
      )}

      <span
        className={clsx(
          'grid h-11 w-11 place-items-center rounded-xl',
          PLAN_ICON_STYLE[plan.slug] ?? 'bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>

      <p className="mt-3 text-sm font-bold uppercase tracking-wide">{plan.name}</p>
      {plan.description && <p className="mt-1 text-sm text-ink-soft">{plan.description}</p>}

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tracking-tight">{formatCurrency(price)}</span>
        {price > 0 && <span className="text-sm text-ink-soft">{period}</span>}
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">
        {price === 0 ? 'Forever' : billingCycle === 'yearly' ? 'Billed yearly' : 'Billed monthly'}
      </p>

      <div className="my-5 border-t border-line dark:border-white/10" />

      <ul className="flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <button
        className={clsx('mt-6 w-full justify-center', isPro ? 'btn-primary' : 'btn-ghost border border-line dark:border-white/10')}
        onClick={onSelect}
        disabled={isCurrent || loading}
      >
        {isCurrent ? 'Current plan' : loading ? 'Please wait…' : 'Get started'}
      </button>
    </div>
  )
}
