import { Badge } from '../../../components/common'
import { SUBSCRIPTION_STATUS_META } from '../adminMeta'

export default function SubscriptionStatusBadge({ status }) {
  if (!status) return <Badge tone="neutral">—</Badge>
  const meta = SUBSCRIPTION_STATUS_META[status] ?? { label: status, tone: 'neutral' }
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}
