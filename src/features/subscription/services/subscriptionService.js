import { supabase } from '../../../lib/supabaseClient'

/**
 * Payment-provider abstraction. No provider is configured yet, so this
 * intentionally does NOT activate anything — a subscription only ever
 * becomes Pro through the subscription-webhook Edge Function once real
 * money has moved. This just starts (or reports that it cannot start) a
 * checkout session, so the rest of the app never has to know which
 * provider (Razorpay / Stripe / Cashfree / ...) is wired up.
 *
 * @returns {Promise<{status: 'redirect'|'not_configured', url?: string, message?: string}>}
 */
export async function createCheckout({ planSlug, billingCycle }) {
  void planSlug
  void billingCycle
  // TODO: once a provider is chosen, call its checkout-session Edge Function
  // here and return { status: 'redirect', url }. Until then, be honest about
  // it instead of faking a successful upgrade.
  return {
    status: 'not_configured',
    message: 'Online payments are not set up yet — please check back soon.',
  }
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
