import { useState } from 'react'
import { Lock } from 'lucide-react'
import { EmptyState } from '../../../components/common'
import { useSubscription } from '../hooks/useSubscription'
import UpgradeModal from './UpgradeModal'
import { FEATURE_LABEL } from '../subscriptionMeta'

/**
 * Wrap a Pro-only piece of UI. Free users see a locked-state card (a product
 * benefit, not a dead end) instead of the feature silently disappearing or
 * the page breaking.
 *
 *   <FeatureGate feature="advanced_analytics" description="...">
 *     <AdvancedAnalytics />
 *   </FeatureGate>
 */
export default function FeatureGate({ feature, title, description, children }) {
  const { hasFeature, isLoading } = useSubscription()
  const [open, setOpen] = useState(false)

  // While subscription state is still loading, don't flash a locked state —
  // wait rather than incorrectly gate a Pro user (see spec §29).
  if (isLoading) return null
  if (hasFeature(feature)) return children

  const label = title ?? FEATURE_LABEL[feature] ?? 'This feature'

  return (
    <>
      <EmptyState
        icon={Lock}
        title={`${label} is a Pro feature`}
        description={description ?? `Unlock ${label.toLowerCase()} and more with MoneyFlow Pro.`}
        action={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            Upgrade to Pro
          </button>
        }
      />
      <UpgradeModal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description={description}
      />
    </>
  )
}
