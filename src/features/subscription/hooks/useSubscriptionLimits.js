import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { fetchMyUsage } from '../services/subscriptionService'

const KEY = ['subscription', 'usage']

/**
 * Actual usage vs. the caller's plan limits (server-computed, one round
 * trip). This is a UX convenience only — the real gate is the
 * enforce_subscription_limit() database trigger, which cannot be bypassed
 * by calling supabase-js directly.
 */
export function useSubscriptionLimits() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: [...KEY, user?.id],
    enabled: Boolean(user?.id),
    queryFn: fetchMyUsage,
    staleTime: 30_000,
  })

  const rows = query.data ?? []
  const byResource = new Map(rows.map((r) => [r.resource, r]))

  const getUsage = (resource) => byResource.get(resource) ?? null

  // While loading/erroring we don't know usage yet — never block creation on
  // missing data (that would incorrectly lock out a Pro user on a slow
  // network); the server trigger is the real enforcement either way.
  const canCreate = (resource) => {
    const row = byResource.get(resource)
    if (!row) return true
    if (row.unlimited) return true
    return row.used < row.limit_value
  }

  return { ...query, usage: rows, getUsage, canCreate }
}
