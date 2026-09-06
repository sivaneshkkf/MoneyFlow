// supabase/functions/subscription-webhook/index.ts
//
// Payment-provider webhook receiver for MoneyFlow subscriptions.
//
// This is the ONLY place a subscription is ever allowed to become Pro,
// renew, be marked past_due, or expire. The React app can never do this —
// `subscriptionService.createCheckout()` only starts a checkout session;
// this function is what the provider calls back once money has actually
// moved. The actual writes happen inside a SECURITY DEFINER RPC (see
// apply_subscription_webhook_event below) so they bypass RLS/grants
// regardless of which Postgres role this function's own API key resolves to.
//
// Provider-agnostic by design: swap the two functions marked "PROVIDER-
// SPECIFIC" below for Razorpay / Stripe / Cashfree once one is chosen.
// Nothing else in this file (idempotency, DB writes, status mapping) needs
// to change.
//
// Required secrets (Supabase project settings -> Edge Functions -> Secrets;
// SUPABASE_URL is provided automatically):
//   SB_PUBLISHABLE_KEY             — this project's Publishable key (Project
//                                    Settings > API Keys). All privileged
//                                    writes go through the
//                                    apply_subscription_webhook_event
//                                    SECURITY DEFINER RPC (030_subscription_
//                                    webhook_rpc.sql), which bypasses RLS/
//                                    grants regardless of the caller's role
//                                    — this project's Secret key was found
//                                    NOT to carry real elevated table
//                                    privileges via supabase-js/PostgREST, so
//                                    this function deliberately never needs it.
//   SUBSCRIPTION_WEBHOOK_SECRET    — provider webhook signing secret
//
// Deploy:
//   supabase functions deploy subscription-webhook --no-verify-jwt
// (--no-verify-jwt because the caller is the payment provider, not a
//  logged-in MoneyFlow user — this function verifies the provider's own
//  signature instead, see verifySignature()).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const PUBLISHABLE_KEY = Deno.env.get('SB_PUBLISHABLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('SUBSCRIPTION_WEBHOOK_SECRET') ?? ''

// All privileged writes happen inside apply_subscription_webhook_event (a
// SECURITY DEFINER RPC), so this client only ever needs a plain, low-
// privilege key to reach PostgREST at all — see the comment above.
const db = createClient(SUPABASE_URL, PUBLISHABLE_KEY)

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

  const nextStatus = STATUS_BY_EVENT[evt.type] ?? null
  // A custom-plan checkout always activates the shared "custom" plan row
  // (same features/limits as Pro) — the negotiated price itself lives on
  // the customer's own custom_plan_requests row, never on subscription_plans.
  const resolvedPlanSlug = evt.customPlanRequestId ? 'custom' : evt.planSlug

  const { data, error } = await db.rpc('apply_subscription_webhook_event', {
    p_user_id: evt.userId,
    p_event_type: evt.type,
    p_provider_event_id: evt.providerEventId || null,
    p_payload: raw,
    p_next_status: nextStatus,
    p_provider: evt.provider,
    p_resolved_plan_slug: resolvedPlanSlug,
    p_billing_cycle: evt.billingCycle,
    p_customer_id: evt.customerId,
    p_subscription_id: evt.subscriptionId,
    p_period_start: evt.periodStart,
    p_period_end: evt.periodEnd,
    p_custom_plan_request_id: evt.customPlanRequestId,
  })

  if (error) {
    console.error('subscription-webhook: apply_subscription_webhook_event failed', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), { status: 200 })
})
