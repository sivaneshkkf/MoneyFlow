// supabase/functions/create-custom-plan-checkout/index.ts
//
// Turns an accepted custom_plan_requests row into a real Razorpay
// subscription and hands the browser just enough to open Razorpay's
// Checkout widget. This is the ONLY place the Razorpay secret key is used
// for creating a charge — it never reaches the browser.
//
// The frontend calls this AFTER accept_custom_plan_offer() has already
// flipped the row to 'payment_pending' (see 027_custom_plan_requests.sql).
// This function re-reads the row itself and re-validates everything before
// creating anything at Razorpay — it never trusts a price, user id or
// billing cycle passed in the request body. The only input is the row id.
//
// Deploy:  supabase functions deploy create-custom-plan-checkout
// Secrets required: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, SB_PUBLISHABLE_KEY
// (SUPABASE_URL is provided automatically by the platform. SB_PUBLISHABLE_KEY
//  must be set manually from Project Settings > API Keys — named SB_* since
//  custom secrets can't use a SUPABASE_ prefix. No elevated/Secret key is
//  needed here: the row read relies on the caller's own session (own_select
//  RLS policy), and the one privileged write goes through the
//  set_custom_plan_provider_subscription SECURITY DEFINER RPC — see
//  031_custom_plan_checkout_rpc.sql for why.)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SB_PUBLISHABLE_KEY')!
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

// Edge Functions don't get CORS headers for free — without these, the
// browser blocks every response (success or error) before the app ever sees
// it, which looks indistinguishable from the function not existing at all.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const authHeader = () => 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)

async function razorpay(path: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.description ?? `Razorpay ${path} failed`)
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return json({ error: 'Payments are not configured yet.' }, 503)
  }

  const authHeaderIn = req.headers.get('Authorization') ?? ''
  const jwt = authHeaderIn.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Missing authorization' }, 401)

  let body: { custom_plan_request_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const requestId = body.custom_plan_request_id
  if (!requestId) return json({ error: 'custom_plan_request_id is required' }, 400)

  // Identify the caller from their own session — not from anything in the body.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser()
  if (callerErr || !callerData?.user) {
    return json({ error: 'Invalid session' }, 401)
  }
  const userId = callerData.user.id

  // Re-derive everything from the database, using the caller's own session
  // (own_select RLS already scopes this to rows the caller owns). The row
  // must already be payment_pending (set by accept_custom_plan_offer, which
  // itself re-checked status/expiry) — never trust the browser.
  const { data: reqRow, error: reqErr } = await callerClient
    .from('custom_plan_requests')
    .select('id, user_id, admin_price, billing_cycle, offer_source, status')
    .eq('id', requestId)
    .maybeSingle()

  if (reqErr || !reqRow) return json({ error: 'Offer not found' }, 404)
  if (reqRow.user_id !== userId) return json({ error: 'Forbidden' }, 403)
  if (reqRow.status !== 'payment_pending') {
    return json({ error: 'This offer is not ready for payment' }, 409)
  }
  if (!reqRow.admin_price || reqRow.admin_price <= 0) {
    return json({ error: 'This offer has no price set' }, 422)
  }

  try {
    // Razorpay has no notion of an arbitrary per-customer subscription price
    // without a Plan object, so one is created on the fly for this exact
    // negotiated amount, then a Subscription is created against it. The
    // amount always comes from admin_price — never from the request body.
    const plan = await razorpay('/plans', {
      period: reqRow.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
      interval: 1,
      item: {
        name: 'MoneyFlow Custom Plan',
        amount: Math.round(Number(reqRow.admin_price) * 100), // paise
        currency: 'INR',
      },
      notes: { custom_plan_request_id: reqRow.id },
    })

    const subscription = await razorpay('/subscriptions', {
      plan_id: plan.id,
      customer_notify: 1,
      total_count: reqRow.billing_cycle === 'yearly' ? 5 : 60, // renews for years; cancel any time
      notes: {
        moneyflow_user_id: userId,
        custom_plan_request_id: reqRow.id,
        offer_source: reqRow.offer_source,
        billing_cycle: reqRow.billing_cycle,
      },
    })

    const { error: cacheErr } = await callerClient.rpc('set_custom_plan_provider_subscription', {
      p_id: reqRow.id,
      p_provider: 'razorpay',
      p_provider_subscription_id: subscription.id,
    })
    if (cacheErr) console.error('create-custom-plan-checkout: failed to persist provider_subscription_id', cacheErr)

    return json({ key_id: RAZORPAY_KEY_ID, subscription_id: subscription.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Checkout creation failed' }, 502)
  }
})
