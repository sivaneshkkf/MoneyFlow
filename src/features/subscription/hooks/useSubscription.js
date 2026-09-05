import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { fetchMySubscription, fetchPlans } from '../services/subscriptionService'
import { isUnlimited } from '../subscriptionMeta'

const KEY = ['subscription', 'me']

/**
 * Single source of truth for "what plan is this user on, and what does it
 * unlock". Backed by get_my_subscription() (self-healing — always resolves
 * to at least Free, never "no plan"). Every other subscription hook/
 * component reads through this instead of querying subscription tables
 * directly.
 */
export function useSubscription() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: [...KEY, user?.id],
    enabled: Boolean(user?.id),
    queryFn: fetchMySubscription,
    staleTime: 60_000,
  })

  const sub = query.data
  // While loading or on a transient error, never claim "Free" for real —
  // isFree/isPro stay false so gated UI doesn't flash a downgrade.
  const resolved = Boolean(sub) && !query.isLoading
  const status = sub?.status
  const planSlug = sub?.plan_slug

  const features = sub?.features ?? {}
  const limits = sub?.limits ?? {}

  return {
    ...query,
    subscription: sub,
    plan: resolved
      ? { id: sub.plan_id, slug: planSlug, name: sub.plan_name, priceMonthly: Number(sub.price_monthly), priceYearly: Number(sub.price_yearly), currency: sub.currency }
      : null,
    isFree: resolved && planSlug === 'free',
    isPro: resolved && planSlug === 'pro' && ['active', 'trialing'].includes(status),
    isTrial: resolved && status === 'trialing',
    isActive: resolved && status === 'active',
    isPastDue: resolved && status === 'past_due',
    isPaused: resolved && status === 'paused',
    isCancelled: resolved && status === 'cancelled',
    isExpired: resolved && status === 'expired',
    isCancelling: Boolean(sub?.cancel_at_period_end),
    features,
    limits,
    hasFeature: (key) => Boolean(features?.[key]),
    getLimit: (resource) => {
      const raw = limits?.[resource]
      return isUnlimited(raw) ? null : Number(raw)
    },
    renewsOn: sub?.current_period_end ?? null,
    trialEndsOn: sub?.trial_end ?? null,
  }
}

export function usePlans() {
  return useQuery({
    queryKey: ['subscription', 'plans'],
    queryFn: fetchPlans,
    staleTime: 5 * 60_000,
  })
}
