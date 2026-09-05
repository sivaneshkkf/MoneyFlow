// supabase/functions/subscription-webhook/index.ts
//
// Payment-provider webhook receiver for MoneyFlow subscriptions.
//
// This is the ONLY place a subscription is ever allowed to become Pro,
// renew, be marked past_due, or expire. The React app can never do this —
// `subscriptionService.createCheckout()` only starts a checkout session;
// this function is what the provider calls back once money has actually
// moved, and only it holds the service-role key that can bypass RLS on
// user_subscriptions / subscription_events.
//
// Provider-agnostic by design: swap the two functions marked "PROVIDER-
// SPECIFIC" below for Razorpay / Stripe / Cashfree once one is chosen.
// Nothing else in this file (idempotency, DB writes, status mapping) needs
// to change.
//
// Required secrets (Supabase project settings -> Edge Functions -> Secrets;
// SUPABASE_URL is provided automatically):
//   SB_SECRET_KEY                 — this project's Secret key (Project
//                                    Settings > API Keys) — the newer
//                                    equivalent of the legacy service_role
//                                    key. Named SB_* (not SUPABASE_*) because
//                                    custom secrets can't use that prefix.
//   SUBSCRIPTION_WEBHOOK_SECRET    — provider webhook signing secret
//
// Deploy:
//   supabase functions deploy subscription-webhook --no-verify-jwt
// (--no-verify-jwt because the caller is the payment provider, not a
//  logged-in MoneyFlow user — this function verifies the provider's own
//  signature instead, see verifySignature()).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SB_SECRET_KEY')!
const WEBHOOK_SECRET = Deno.env.get('SUBSCRIPTION_WEBHOOK_SECRET') ?? ''

// Service-role client: intentionally never imported by, or reachable from,
// any browser code. RLS is bypassed here on purpose — this function IS the
// trusted backend the RLS policies defer to.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// --- PROVIDER-SPECIFIC: signature verification -----------------------------
// Replace with the real HMAC check for whichever provider is configured
// (Stripe: `Stripe-Signature` header + `stripe.webhooks.constructEvent`;
// Razorpay: `X-Razorpay-Signature` header + HMAC-SHA256 over the raw body).
async function verifySignature(rawBody: string, headers: Headers): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false // refuse everything until a provider is configured
  const signature = headers.get('x-webhook-signature') ?? headers.get('x-razorpay-signature') ?? ''
  if (!signature) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return expected === signature
}

// --- PROVIDER-SPECIFIC: normalise the provider's payload -------------------
// Maps whatever the provider sends into MoneyFlow's own shape so the rest
// of this function stays provider-agnostic. `notes` is where both the
// regular checkout (subscriptionService.createCheckout, once wired) and the
// custom-plan checkout (create-custom-plan-checkout) put their metadata —
// Razorpay echoes `notes` back on the subscription/payment entity, so this
// looks in every place that could plausibly hold it.
function findNotes(raw: Record<string, unknown>): Record<string, unknown> {
  const payload = raw.payload as Record<string, unknown> | undefined
  const sub = payload?.subscription as Record<string, unknown> | undefined
  const pay = payload?.payment as Record<string, unknown> | undefined
  const subEntity = sub?.entity as Record<string, unknown> | undefined
  const payEntity = pay?.entity as Record<string, unknown> | undefined
  return (
    (raw.notes as Record<string, unknown> | undefined) ??
    (raw.metadata as Record<string, unknown> | undefined) ??
    (subEntity?.notes as Record<string, unknown> | undefined) ??
    (payEntity?.notes as Record<string, unknown> | undefined) ??
    {}
  )
}

// Razorpay sends subscription period boundaries as Unix seconds, not ISO.
function toIso(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number') return new Date(v * 1000).toISOString()
  return null
}

function normalizeEvent(raw: Record<string, unknown>) {
  const notes = findNotes(raw)
  const payload = raw.payload as Record<string, unknown> | undefined
  const subEntity = (payload?.subscription as Record<string, unknown> | undefined)?.entity as
    | Record<string, unknown>
    | undefined

  return {
    providerEventId: String(raw.id ?? raw.event_id ?? ''),
    type: String(raw.type ?? raw.event ?? 'unknown'),
    userId: String(notes.moneyflow_user_id ?? notes.user_id ?? ''),
    planSlug: String(notes.plan_slug ?? 'pro'),
    billingCycle: notes.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
    customerId: (raw.customer_id ?? raw.customer ?? subEntity?.customer_id ?? null) as string | null,
    subscriptionId: (raw.subscription_id ?? raw.subscription ?? subEntity?.id ?? null) as string | null,
    periodStart: toIso(raw.current_period_start ?? subEntity?.current_start),
    periodEnd: toIso(raw.current_period_end ?? subEntity?.current_end),
    provider: String(raw.provider ?? (payload ? 'razorpay' : 'unknown')),
    // Custom Plan / Request-a-Quote linkage — absent for a regular Free/Pro checkout.
    customPlanRequestId: (notes.custom_plan_request_id ?? null) as string | null,
    offerSource: (notes.offer_source ?? null) as string | null,
  }
}

const STATUS_BY_EVENT: Record<string, string> = {
  'checkout.completed': 'active',
  'subscription.activated': 'active',
  'subscription.charged': 'active', // Razorpay: each successful renewal/first charge
  'invoice.paid': 'active',
  'subscription.renewed': 'active',
  'payment.failed': 'past_due',
  'invoice.payment_failed': 'past_due',
  'subscription.pending': 'past_due', // Razorpay: a charge attempt failed, will retry
  'subscription.halted': 'past_due', // Razorpay: retries exhausted, still recoverable
  'subscription.paused': 'paused',
  'subscription.cancelled': 'cancelled',
  'subscription.completed': 'expired', // Razorpay: fixed-count subscription ran its course
  'subscription.expired': 'expired',
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const verified = await verifySignature(rawBody, req.headers)
  if (!verified) {
    return new Response('Invalid signature', { status: 401 })
  }

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const evt = normalizeEvent(raw)
  if (!evt.userId) {
    return new Response('Missing user reference', { status: 400 })
  }

  // Idempotency: a redelivered webhook with the same provider_event_id must
  // never be processed twice. The unique index on subscription_events makes
  // this atomic even under concurrent delivery.
  if (evt.providerEventId) {
    const { data: existing } = await admin
      .from('subscription_events')
      .select('id')
      .eq('provider_event_id', evt.providerEventId)
      .maybeSingle()
    if (existing) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 })
    }
  }

  const nextStatus = STATUS_BY_EVENT[evt.type]

  // Always log the raw event, whether or not we recognise its type.
  const { data: subRow } = await admin
    .from('user_subscriptions')
    .select('id')
    .eq('user_id', evt.userId)
    .maybeSingle()

  await admin.from('subscription_events').insert({
    user_id: evt.userId,
    subscription_id: subRow?.id ?? null,
    event_type: evt.type,
    provider_event_id: evt.providerEventId || null,
    payload: raw,
  })

  if (!nextStatus) {
    // Recognised as "logged, no state change needed" — return 200 so the
    // provider does not keep retrying an event we intentionally ignore.
    return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 })
  }

  const patch: Record<string, unknown> = {
    status: nextStatus,
    provider: evt.provider,
    updated_at: new Date().toISOString(),
  }
  if (nextStatus === 'active') {
    // A custom-plan checkout always activates the shared "custom" plan row
    // (same features/limits as Pro) — the negotiated price itself lives on
    // the customer's own custom_plan_requests row, never on subscription_plans.
    const planSlug = evt.customPlanRequestId ? 'custom' : evt.planSlug
    const { data: plan } = await admin
      .from('subscription_plans')
      .select('id')
      .eq('slug', planSlug)
      .maybeSingle()
    patch.plan_id = plan?.id
    patch.billing_cycle = evt.billingCycle
    patch.cancel_at_period_end = false
    patch.cancelled_at = null
    if (evt.customerId) patch.provider_customer_id = evt.customerId
    if (evt.subscriptionId) patch.provider_subscription_id = evt.subscriptionId
    if (evt.periodStart) patch.current_period_start = evt.periodStart
    if (evt.periodEnd) patch.current_period_end = evt.periodEnd
  }
  if (nextStatus === 'cancelled' || nextStatus === 'expired') {
    patch.cancelled_at = new Date().toISOString()
  }

  const { error } = await admin.from('user_subscriptions').update(patch).eq('user_id', evt.userId)
  if (error) {
    console.error('subscription-webhook: failed to update user_subscriptions', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }

  // Custom Plan / Request-a-Quote linkage: flip the offer to active on first
  // successful charge. The `.eq('status', 'payment_pending')` guard makes
  // this a no-op on later renewal charges (already 'active') and on any
  // redelivered/duplicate webhook — idempotent by construction, no separate
  // check needed.
  if (nextStatus === 'active' && evt.customPlanRequestId) {
    await admin
      .from('custom_plan_requests')
      .update({
        status: 'active',
        provider: evt.provider,
        provider_subscription_id: evt.subscriptionId ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', evt.customPlanRequestId)
      .eq('status', 'payment_pending')
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
