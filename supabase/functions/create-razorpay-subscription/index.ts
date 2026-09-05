// supabase/functions/create-razorpay-subscription/index.ts
//
// Turns a regular Free -> Pro upgrade into a real Razorpay subscription and
// hands the browser just enough to open Razorpay's Checkout widget. This is
// the ONLY place the Razorpay secret key is used for a *regular* plan
// checkout (see create-custom-plan-checkout for the Custom Plan equivalent).
//
// The frontend calls this directly from the Pricing page. It never sends a
// price — only which plan slug ('pro') and billing cycle the user picked.
// The amount charged always comes from subscription_plans in the database,
// never from the request body, so a tampered client request can only ever
// buy the real, published price.
//
// Activation itself never happens here: this only creates the Razorpay
// subscription and returns its id. Only the subscription-webhook Edge
// Function, once Razorpay confirms payment, is allowed to mark anything
// active (see subscription-webhook/index.ts).
//
// Deploy:  supabase functions deploy create-razorpay-subscription
// Secrets required: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, SB_SECRET_KEY,
// SB_PUBLISHABLE_KEY
// (SUPABASE_URL is provided automatically by the platform. The other two
//  must be set manually — this project uses Supabase's newer Publishable/
//  Secret key system, not legacy anon/service_role JWTs, and custom secrets
//  can't be named with a SUPABASE_ prefix, so they're named SB_* here. Get
//  both values from Project Settings > API Keys.)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SB_SECRET_KEY')!
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

  let body: { plan_slug?: string; billing_cycle?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const planSlug = body.plan_slug
  const billingCycle = body.billing_cycle === 'yearly' ? 'yearly' : 'monthly'
  if (!planSlug) return json({ error: 'plan_slug is required' }, 400)

  // Identify the caller from their own session — not from anything in the body.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser()
  if (callerErr || !callerData?.user) {
    return json({ error: 'Invalid session' }, 401)
  }
  const userId = callerData.user.id

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // The price always comes from the published plan row — never from the
  // request body — so a tampered client can only ever buy the real price.
  const { data: plan, error: planErr } = await admin
    .from('subscription_plans')
    .select('id, slug, name, price_monthly, price_yearly, provider_plan_id_monthly, provider_plan_id_yearly, is_active')
    .eq('slug', planSlug)
    .maybeSingle()

  if (planErr) {
    return json({ error: `Plan lookup failed: ${planErr.message}` }, 500)
  }
  if (!plan || !plan.is_active) {
    return json({ error: `Plan not found for slug "${planSlug}"` }, 404)
  }
  const amount = billingCycle === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly)
  if (!amount || amount <= 0) {
    return json({ error: 'This plan has no online price set' }, 422)
  }

  const cachedPlanIdField = billingCycle === 'yearly' ? 'provider_plan_id_yearly' : 'provider_plan_id_monthly'

  try {
    // Reuse the Razorpay Plan object created for this (plan, cycle) pair on
    // an earlier checkout, if any, instead of creating a new one every time.
    let providerPlanId = plan[cachedPlanIdField] as string | null
    if (!providerPlanId) {
      const rpPlan = await razorpay('/plans', {
        period: billingCycle,
        interval: 1,
        item: {
          name: `MoneyFlow ${plan.name}`,
          amount: Math.round(amount * 100), // paise
          currency: 'INR',
        },
        notes: { plan_slug: plan.slug, billing_cycle: billingCycle },
      })
      providerPlanId = rpPlan.id
      await admin.from('subscription_plans').update({ [cachedPlanIdField]: providerPlanId }).eq('id', plan.id)
    }

    const subscription = await razorpay('/subscriptions', {
      plan_id: providerPlanId,
      customer_notify: 1,
      total_count: billingCycle === 'yearly' ? 5 : 60, // renews for years; cancel any time
      notes: {
        moneyflow_user_id: userId,
        plan_slug: plan.slug,
        billing_cycle: billingCycle,
      },
    })

    return json({ key_id: RAZORPAY_KEY_ID, subscription_id: subscription.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Checkout creation failed' }, 502)
  }
})
