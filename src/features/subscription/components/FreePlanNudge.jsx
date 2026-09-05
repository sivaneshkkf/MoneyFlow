import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useSubscription } from '../hooks/useSubscription'
import { useSubscriptionLimits } from '../hooks/useSubscriptionLimits'
import { RESOURCE_LABEL } from '../subscriptionMeta'

/**
 * A single, quiet line for Free users — never shown for Pro, never shown
 * while subscription/usage state is still loading.
 */
export default function FreePlanNudge() {
  const { isFree, isLoading } = useSubscription()
  const { usage, isLoading: usageLoading } = useSubscriptionLimits()
  if (isLoading || usageLoading || !isFree) return null

  // Highlight whichever resource the user is closest to maxing out.
  const closest = [...usage]
    .filter((u) => !u.unlimited && u.limit_value > 0)
    .sort((a, b) => b.used / b.limit_value - a.used / a.limit_value)[0]

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-[#161F1D]">
      <span className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400">
          <Sparkles className="h-4 w-4" />
        </span>
        <span>
          You&apos;re on the <b>Free</b> plan
          {closest && (
            <span className="text-ink-soft">
              {' '}
              · {RESOURCE_LABEL[closest.resource]} {closest.used} / {closest.limit_value}
            </span>
          )}
        </span>
      </span>
      <Link to="/pricing" className="btn-ghost !py-1.5 text-xs">
        Upgrade to Pro
      </Link>
    </div>
  )
}
