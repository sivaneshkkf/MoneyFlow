// supabase/functions/admin-actions/index.ts
//
// User suspend / reactivate.
//
// Why an Edge Function and not a Postgres RPC: suspension must actually stop
// a user from using the app, not just flip a display column. The officially
// supported way to do that in Supabase is to ban the auth.users row via the
// Admin API (auth.admin.updateUserById), which only accepts the service-role
// key — a key that must never reach the browser and that plain SQL (even
// SECURITY DEFINER) cannot use. So this one action lives server-side, in the
// same spirit as subscription-webhook: the service-role key is created here,
// once, and never shipped to React.
//
// A banned user is rejected by Supabase Auth on their next sign-in / token
// refresh (access tokens are short-lived, so this takes effect within that
// window even if they already have an open tab) — deliberately NOT
// implemented by retrofitting a status check onto every existing RLS policy
// in the app, which would be a much larger, riskier surface to touch for the
// same outcome.
//
// Deploy:  supabase functions deploy admin-actions
// Secrets required: SB_SECRET_KEY, SB_PUBLISHABLE_KEY (Project Settings >
// API Keys — this project uses the newer Publishable/Secret key system, not
// legacy anon/service_role JWTs, and custom secrets can't use a SUPABASE_
// prefix, so they're named SB_* here; SUPABASE_URL is provided automatically).
// (JWT verification IS wanted here — the caller must be a signed-in admin —
//  so this one is deployed WITHOUT --no-verify-jwt, unlike subscription-webhook.)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SB_SECRET_KEY')!
const ANON_KEY = Deno.env.get('SB_PUBLISHABLE_KEY')!

// 10 years — effectively indefinite, reversible via 'none'.
const BAN_DURATION = '87600h'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401 })
  }

  let body: { targetUserId?: string; action?: 'suspend' | 'reactivate'; reason?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }
  const { targetUserId, action, reason } = body
  if (!targetUserId || !['suspend', 'reactivate'].includes(action ?? '')) {
    return new Response(JSON.stringify({ error: 'targetUserId and action (suspend|reactivate) are required' }), { status: 400 })
  }

  // Identify the caller from their own JWT (anon-key client — does not
  // bypass anything, just decodes/validates the session like any other call).
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser()
  if (callerErr || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 })
  }
  const callerId = callerData.user.id

  // Service-role client: the only place in this app that holds this key.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Re-derive the caller's role from the database — never trust anything
  // about role/permissions coming from the request body.
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', callerId)
  const isAdmin = (roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin')
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403 })
  }

  // A caller may not suspend themselves out of the console.
  if (targetUserId === callerId && action === 'suspend') {
    return new Response(JSON.stringify({ error: 'You cannot suspend your own account' }), { status: 400 })
  }

  const { error: banErr } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: action === 'suspend' ? BAN_DURATION : 'none',
  })
  if (banErr) {
    return new Response(JSON.stringify({ error: banErr.message }), { status: 500 })
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .update({ status: action === 'suspend' ? 'suspended' : 'active', updated_at: new Date().toISOString() })
    .eq('id', targetUserId)
  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message }), { status: 500 })
  }

  await admin.from('admin_audit_logs').insert({
    admin_user_id: callerId,
    action: action === 'suspend' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
    target_user_id: targetUserId,
    resource_type: 'profiles',
    resource_id: targetUserId,
    metadata: { reason: reason ?? null },
  })

  return new Response(JSON.stringify({ ok: true, status: action === 'suspend' ? 'suspended' : 'active' }), { status: 200 })
})
