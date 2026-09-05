import { ProgressBar } from '../../../components/common'
import { RESOURCE_LABEL } from '../subscriptionMeta'

/** One resource's usage-vs-limit row, e.g. "Accounts  2 / 3". */
export default function UsageProgress({ resource, usage }) {
  if (!usage) return null
  const { used, limit_value: limit, unlimited } = usage
  const pct = unlimited || !limit ? 0 : Math.min(100, (used / limit) * 100)
  const nearLimit = !unlimited && limit > 0 && used / limit >= 0.8

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium">{RESOURCE_LABEL[resource] ?? resource}</span>
        <span className={nearLimit ? 'font-semibold text-warning' : 'text-ink-soft'}>
          {used} / {unlimited ? 'Unlimited' : limit}
        </span>
      </div>
      {!unlimited && <ProgressBar value={pct} tone={pct >= 100 ? 'danger' : nearLimit ? 'warning' : 'success'} />}
    </div>
  )
}
