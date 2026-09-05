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
// Secrets required: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are provided
//  automatically by the platform.)
//
// NOT LIVE-TESTED — requires a real Razorpay account (test-mode keys are
// enough) and the two secrets above configured before this can run.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

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
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return new Response(JSON.stringify({ error: 'Payments are not configured yet.' }), { status: 503 })
  }

  const authHeaderIn = req.headers.get('Authorization') ?? ''
  const jwt = authHeaderIn.replace(/^Bearer\s+/i, '')
  if (!jwt) return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401 })

  let body: { custom_plan_request_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }
  const requestId = body.custom_plan_request_id
  if (!requestId) return new Response(JSON.stringify({ error: 'custom_plan_request_id is required' }), { status: 400 })

  // Identify the caller from their own session — not from anything in the body.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser()
  if (callerErr || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 })
  }
  const userId = callerData.user.id

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Re-derive everything from the database. The row must belong to this
  // user and must already be payment_pending (set by accept_custom_plan_offer,
  // which itself re-checked status/expiry) — never trust the browser.
  const { data: reqRow, error: reqErr } = await admin
    .from('custom_plan_requests')
    .select('id, user_id, admin_price, billing_cycle, offer_source, status')
    .eq('id', requestId)
    .maybeSingle()

  if (reqErr || !reqRow) return new Response(JSON.stringify({ error: 'Offer not found' }), { status: 404 })
  if (reqRow.user_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  if (reqRow.status !== 'payment_pending') {
    return new Response(JSON.stringify({ error: 'This offer is not ready for payment' }), { status: 409 })
  }
  if (!reqRow.admin_price || reqRow.admin_price <= 0) {
    return new Response(JSON.stringify({ error: 'This offer has no price set' }), { status: 422 })
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

    await admin
      .from('custom_plan_requests')
      .update({ provider: 'razorpay', provider_subscription_id: subscription.id, updated_at: new Date().toISOString() })
      .eq('id', reqRow.id)

    return new Response(
      JSON.stringify({ key_id: RAZORPAY_KEY_ID, subscription_id: subscription.id }),
      { status: 200 },
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Checkout creation failed' }), { status: 502 })
  }
})
