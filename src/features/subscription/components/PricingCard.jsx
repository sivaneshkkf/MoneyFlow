import { Check, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency } from '../../../utils/format'
import { planFeatureList } from '../subscriptionMeta'

export default function PricingCard({ plan, billingCycle, isCurrent, onSelect, loading }) {
  const isPro = plan.slug === 'pro'
  const price = billingCycle === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly)
  const period = billingCycle === 'yearly' ? '/year' : '/month'
  const features = planFeatureList(plan)

  return (
    <div
      className={clsx(
        'relative flex flex-col rounded-2xl border p-6 transition',
        isPro
          ? 'border-brand-700/40 bg-gradient-to-b from-brand-50/70 to-white shadow-md dark:from-brand-700/10 dark:to-transparent'
          : 'border-line bg-white dark:border-white/10 dark:bg-[#161F1D]',
      )}
    >
      {isPro && (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-dark px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:bg-brand-700">
          <Sparkles className="h-3 w-3" /> Most popular
        </span>
      )}

      <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{plan.name}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tracking-tight">{formatCurrency(price)}</span>
        {price > 0 && <span className="text-sm text-ink-soft">{period}</span>}
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">{price === 0 ? 'Forever' : billingCycle === 'yearly' ? 'Billed yearly' : 'Billed monthly'}</p>

      {plan.description && <p className="mt-3 text-sm text-ink-soft">{plan.description}</p>}

      <ul className="mt-5 flex-1 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <span
              className={clsx(
                'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full',
                isPro ? 'bg-success/15 text-success' : 'bg-brand-400/15 text-brand-700 dark:text-brand-400',
              )}
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
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
        {isCurrent ? 'Current plan' : loading ? 'Please wait…' : isPro ? 'Upgrade to Pro' : 'Get started'}
      </button>
    </div>
  )
}
