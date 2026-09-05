import { supabase } from '../../../lib/supabaseClient'

// --- User-facing --------------------------------------------------------
// Request-a-quote is a direct insert: RLS's own_insert_request policy is the
// entire enforcement (self-owned, un-priced, status='pending' only) — no RPC
// needed for this one, same as how accounts/transactions are inserted.
export async function requestCustomPlan({ billingCycle, requestedPrice, description, additionalRequirements }) {
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('custom_plan_requests')
    .insert({
      user_id: auth.user.id,
      offer_source: 'user_request',
      billing_cycle: billingCycle,
      requested_price: requestedPrice || null,
      description: description || null,
      additional_requirements: additionalRequirements || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** The current user's single most relevant custom-plan row, if any. */
export async function fetchMyCustomPlanOffer() {
  const { data, error } = await supabase
    .from('custom_plan_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function declineCustomPlanOffer(id) {
  const { error } = await supabase.rpc('decline_custom_plan_offer', { p_id: id })
  if (error) throw error
}

/** Flips the row to payment_pending server-side; returns it (admin_price etc). */
export async function acceptCustomPlanOffer(id) {
  const { data, error } = await supabase.rpc('accept_custom_plan_offer', { p_id: id })
  if (error) throw error
  return data
}

/** Creates the real Razorpay subscription for an already-accepted offer. */
export async function createCustomPlanCheckout(id) {
  const { data, error } = await supabase.functions.invoke('create-custom-plan-checkout', {
    body: { custom_plan_request_id: id },
  })
  if (error) throw error
  return data
}

// --- Admin ----------------------------------------------------------------
export async function getAdminCustomPlanRequests({ source = '', status = '', search = '', limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('admin_list_custom_plan_requests', {
    p_source: source || null,
    p_status: status || null,
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  const rows = data ?? []
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function getAdminCustomPlanRequestDetail(id) {
  const { data, error } = await supabase.rpc('admin_get_custom_plan_request', { p_id: id })
  if (error) throw error
  return data?.[0] ?? null
}

export async function respondToCustomPlanRequest({ id, adminPrice, billingCycle, adminMessage, validUntil, reason }) {
  const { data, error } = await supabase.rpc('admin_respond_custom_plan_request', {
    p_id: id, p_admin_price: adminPrice, p_billing_cycle: billingCycle,
    p_admin_message: adminMessage || null, p_valid_until: validUntil || null, p_reason: reason || null,
  })
  if (error) throw error
  return data
}

export async function rejectCustomPlanRequest({ id, reason }) {
  const { error } = await supabase.rpc('admin_reject_custom_plan_request', { p_id: id, p_reason: reason || null })
  if (error) throw error
}

export async function createCustomOffer({ userId, price, billingCycle, description, adminMessage, validUntil }) {
  const { data, error } = await supabase.rpc('admin_create_custom_offer', {
    p_user: userId, p_price: price, p_billing_cycle: billingCycle, p_description: description,
    p_admin_message: adminMessage || null, p_valid_until: validUntil || null,
  })
  if (error) throw error
  return data
}

export async function updateCustomOffer({ id, adminPrice, adminMessage, validUntil, reason }) {
  const { data, error } = await supabase.rpc('admin_update_custom_offer', {
    p_id: id, p_admin_price: adminPrice, p_admin_message: adminMessage || null,
    p_valid_until: validUntil || null, p_reason: reason || null,
  })
  if (error) throw error
  return data
}

export async function cancelCustomOffer({ id, reason }) {
  const { error } = await supabase.rpc('admin_cancel_custom_offer', { p_id: id, p_reason: reason || null })
  if (error) throw error
}
