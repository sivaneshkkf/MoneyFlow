import { supabase } from '../../../lib/supabaseClient'

/**
 * Creates a real Razorpay subscription for a regular (non-Custom) plan
 * upgrade. Activation itself never happens here — only the
 * subscription-webhook Edge Function, once Razorpay confirms payment, is
 * allowed to mark anything active. If payments aren't configured yet
 * (secrets missing on the backend), the Edge Function reports that plainly
 * instead of faking a successful upgrade.
 *
 * @returns {Promise<{status: 'checkout'|'not_configured', key_id?: string, subscription_id?: string, message?: string}>}
 */
export async function createCheckout({ planSlug, billingCycle }) {
  const { data, error } = await supabase.functions.invoke('create-razorpay-subscription', {
    body: { plan_slug: planSlug, billing_cycle: billingCycle },
  })
  if (error) {
    // A non-2xx from the function (e.g. 503 "not configured yet") lands here
    // as a FunctionsHttpError whose `context` is the raw Response — read its
    // JSON body for the specific message the function returned.
    let message = 'Online payments are not set up yet — please check back soon.'
    try {
      const body = await error.context?.json()
      if (body?.error) message = body.error
    } catch {
      // Keep the default message if the error body isn't JSON.
    }
    return { status: 'not_configured', message }
  }
  return { status: 'checkout', key_id: data.key_id, subscription_id: data.subscription_id }
}

export async function fetchMySubscription() {
  const { data, error } = await supabase.rpc('get_my_subscription')
  if (error) throw error
  return data?.[0] ?? null
}

export async function fetchMyUsage() {
  const { data, error } = await supabase.rpc('get_subscription_usage')
  if (error) throw error
  return data ?? []
}

export async function fetchPlans() {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function cancelMySubscription() {
  const { data, error } = await supabase.rpc('cancel_subscription')
  if (error) throw error
  return data
}

export async function resumeMySubscription() {
  const { data, error } = await supabase.rpc('resume_subscription')
  if (error) throw error
  return data
}

// Payment/renewal events only — subscription_events is an append-only log of
// every webhook Razorpay ever sent us (activations, renewals, failures,
// cancellations…). RLS lets a user select only their own rows directly (no
// RPC needed). We only surface the event types that represent an actual
// successful charge; the amount is read straight off Razorpay's own
// payment.entity.amount (paise) when present, never invented.
const CHARGE_EVENT_TYPES = ['subscription.activated', 'subscription.charged', 'subscription.renewed', 'invoice.paid']

const EVENT_DESCRIPTION = {
  'subscription.activated': 'Plan activated',
  'subscription.charged': 'Plan renewal',
  'subscription.renewed': 'Plan renewal',
  'invoice.paid': 'Invoice paid',
}

function extractPaidAmount(payload) {
  const paise = payload?.payload?.payment?.entity?.amount
  return paise != null ? Number(paise) / 100 : null
}

export async function fetchMyBillingHistory(limit = 5) {
  const { data, error } = await supabase
    .from('subscription_events')
    .select('id, event_type, payload, created_at')
    .in('event_type', CHARGE_EVENT_TYPES)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((e) => ({
    id: e.id,
    date: e.created_at,
    description: EVENT_DESCRIPTION[e.event_type] ?? e.event_type,
    amount: extractPaidAmount(e.payload),
  }))
}
