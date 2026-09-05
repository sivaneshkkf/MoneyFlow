import { Badge } from '../../../components/common'
import { USER_STATUS_META } from '../adminMeta'

export default function UserStatusBadge({ status }) {
  const meta = USER_STATUS_META[status] ?? USER_STATUS_META.active
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}
