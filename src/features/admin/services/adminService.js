import { supabase } from '../../../lib/supabaseClient'

// Every admin_* RPC re-checks the caller's role server-side (require_admin /
// require_super_admin) — nothing here is a real permission boundary, it's
// just the client-side call shape.

export async function checkAdminAccess() {
  const [admin, superAdmin] = await Promise.all([
    supabase.rpc('is_admin'),
    supabase.rpc('is_super_admin'),
  ])
  if (admin.error) throw admin.error
  if (superAdmin.error) throw superAdmin.error
  return { isAdmin: Boolean(admin.data), isSuperAdmin: Boolean(superAdmin.data) }
}

export async function getAdminDashboardStats() {
  const { data, error } = await supabase.rpc('admin_get_dashboard_stats')
  if (error) throw error
  return data?.[0] ?? null
}

export async function getAdminUserGrowth(days = 30) {
  const { data, error } = await supabase.rpc('admin_user_growth', { p_days: days })
  if (error) throw error
  return data ?? []
}

export async function getAdminSubscriptionGrowth(days = 30) {
  const { data, error } = await supabase.rpc('admin_subscription_growth', { p_days: days })
  if (error) throw error
  return data ?? []
}

export async function getAdminUsers({ search = '', planSlug = '', status = '', limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_search: search || null,
    p_plan_slug: planSlug || null,
    p_status: status || null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  const rows = data ?? []
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function getAdminUserDetails(userId) {
  const { data, error } = await supabase.rpc('admin_get_user_details', { p_user: userId })
  if (error) throw error
  return data?.[0] ?? null
}

export async function getAdminUserUsage(userId) {
  const { data, error } = await supabase.rpc('admin_get_user_usage', { p_user: userId })
  if (error) throw error
  return data ?? []
}

export async function viewFinancialData(userId) {
  const { data, error } = await supabase.rpc('admin_view_financial_data', { p_user: userId })
  if (error) throw error
  return data
}

export async function getAdminSubscriptions({ status = '', planSlug = '', limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('admin_list_subscriptions', {
    p_status: status || null,
    p_plan_slug: planSlug || null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  const rows = data ?? []
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function changeUserPlan({ userId, planSlug, billingCycle, reason }) {
  const { data, error } = await supabase.rpc('admin_change_user_plan', {
    p_user: userId, p_plan_slug: planSlug, p_billing_cycle: billingCycle, p_reason: reason || null,
  })
  if (error) throw error
  return data
}

export async function cancelUserSubscription({ userId, reason }) {
  const { data, error } = await supabase.rpc('admin_cancel_subscription', { p_user: userId, p_reason: reason || null })
  if (error) throw error
  return data
}

export async function resumeUserSubscription({ userId, reason }) {
  const { data, error } = await supabase.rpc('admin_resume_subscription', { p_user: userId, p_reason: reason || null })
  if (error) throw error
  return data
}

export async function getAdminPlans() {
  const { data, error } = await supabase.from('subscription_plans').select('*').order('sort_order')
  if (error) throw error
  return data ?? []
}

export async function updateAdminPlan(plan) {
  const { data, error } = await supabase.rpc('admin_update_plan', {
    p_plan_id: plan.id,
    p_name: plan.name,
    p_description: plan.description ?? '',
    p_price_monthly: plan.price_monthly,
    p_price_yearly: plan.price_yearly,
    p_currency: plan.currency ?? 'INR',
    p_features: plan.features ?? {},
    p_limits: plan.limits ?? {},
    p_is_active: plan.is_active,
    p_sort_order: plan.sort_order ?? 0,
  })
  if (error) throw error
  return data
}

export async function getAdminPayments({ eventType = '', limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('admin_list_payments', {
    p_event_type: eventType || null, p_limit: limit, p_offset: offset,
  })
  if (error) throw error
  const rows = data ?? []
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function getAdminAuditLogs({ adminUser = '', action = '', targetUser = '', from = '', to = '', limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('admin_list_audit_logs', {
    p_admin_user: adminUser || null,
    p_action: action || null,
    p_target_user: targetUser || null,
    p_from: from || null,
    p_to: to || null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  const rows = data ?? []
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function getAdminAdmins() {
  const { data, error } = await supabase.rpc('admin_list_admins')
  if (error) throw error
  return data ?? []
}

export async function grantAdminRole({ userId, role, reason }) {
  const { error } = await supabase.rpc('admin_grant_role', { p_user: userId, p_role: role, p_reason: reason || null })
  if (error) throw error
}

export async function revokeAdminRole({ userId, role, reason }) {
  const { error } = await supabase.rpc('admin_revoke_role', { p_user: userId, p_role: role, p_reason: reason || null })
  if (error) throw error
}

// Suspend/reactivate go through the admin-actions Edge Function — this is the
// one operation that needs the service-role Auth Admin API, which no
// Postgres RPC can reach. functions.invoke() attaches the caller's session
// automatically; the function re-derives and re-checks the role itself.
export async function suspendUser({ userId, reason }) {
  const { data, error } = await supabase.functions.invoke('admin-actions', {
    body: { targetUserId: userId, action: 'suspend', reason },
  })
  if (error) throw error
  return data
}

export async function reactivateUser({ userId, reason }) {
  const { data, error } = await supabase.functions.invoke('admin-actions', {
    body: { targetUserId: userId, action: 'reactivate', reason },
  })
  if (error) throw error
  return data
}
