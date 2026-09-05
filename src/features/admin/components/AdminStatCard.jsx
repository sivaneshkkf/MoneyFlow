import { StatCard } from '../../../components/common'

/**
 * Thin wrapper over the shared StatCard: adds an explicit "not available"
 * state for metrics that depend on data we don't have yet (e.g. revenue
 * before a payment provider is connected) — never render a fabricated number.
 */
export default function AdminStatCard({ unavailable, unavailableHint = 'Not available yet', ...props }) {
  if (unavailable) {
    return <StatCard {...props} amount="—" hint={unavailableHint} />
  }
  return <StatCard {...props} />
}
