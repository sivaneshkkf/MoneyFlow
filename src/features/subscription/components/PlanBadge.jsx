import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useSubscription } from '../hooks/useSubscription'

/**
 * Compact plan indicator for the header / settings. Deliberately tiny —
 * this is a status chip, not a promo banner.
 */
export default function PlanBadge({ className }) {
  const { plan, isPro, isLoading } = useSubscription()
  if (isLoading || !plan) return null

  return (
    <Link
      to="/settings/subscription"
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide transition',
        isPro
          ? 'bg-gradient-to-r from-dark to-brand-700 text-white hover:opacity-90'
          : 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-white/5 dark:text-brand-400 dark:hover:bg-white/10',
        className,
      )}
      aria-label={`Current plan: ${plan.name}`}
    >
      {isPro && <Sparkles className="h-3 w-3" />}
      {plan.name?.toUpperCase()}
    </Link>
  )
}
