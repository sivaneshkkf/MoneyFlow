// supabase/functions/send-push-notifications/index.ts
//
// Delivers real system/mobile push notifications for whatever's sitting
// unsent in public.alerts (bill/recurring due, budget threshold crossed,
// credit card statement due, subscription/billing events — see
// migrations/049_push_notifications.sql for what generates each of those).
// Postgres can't sign/send a Web Push request itself, so this function
// exists purely to do that; pg_cron + pg_net call it every 5 minutes
// (public.trigger_send_push_notifications()).
//
// This is a system job, not a user-facing endpoint — its only caller is
// pg_net, authenticated with a shared secret (never a Supabase JWT), so it
// must be deployed with --no-verify-jwt (same reasoning as
// subscription-webhook, whose caller is also not a logged-in MoneyFlow
// user).
//
// Required secrets (Supabase project settings -> Edge Functions -> Secrets;
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically):
//   PUSH_CRON_SECRET   — must match public.app_config's 'push_cron_secret'
//                        row exactly (see the setup checklist below).
//   VAPID_PUBLIC_KEY    — from `npx web-push generate-vapid-keys`
//   VAPID_PRIVATE_KEY   — ditto — keep this one secret, never in client code
//   VAPID_SUBJECT        — e.g. "mailto:support@moneyflowtracker.app"
//
// Deploy:
//   supabase functions deploy send-push-notifications --no-verify-jwt
//
// One-time setup after deploying (all via the Supabase SQL Editor):
//   update public.app_config set value = 'https://<project-ref>.functions.supabase.co/send-push-notifications' where key = 'push_function_url';
//   update public.app_config set value = '<same value as PUSH_CRON_SECRET secret>' where key = 'push_cron_secret';

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET')
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

// Where a tap on the notification should land — related_id / type give
// enough to route sensibly without a lookup table.
function urlForAlert(type: string): string {
  if (type.startsWith('bill_') || type.startsWith('payment_')) return '/bills'
  if (type.startsWith('budget_')) return '/budgets'
  if (type.startsWith('card_')) return '/accounts'
  if (type.startsWith('custom_plan_') || type.startsWith('CUSTOM_PLAN_')) return '/settings/subscription'
  return '/dashboard'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.error('send-push-notifications: VAPID secrets not configured yet')
    return new Response(JSON.stringify({ ok: false, error: 'VAPID not configured' }), { status: 200 })
  }

  const { data: rows, error } = await db.rpc('_push_delivery_queue', { p_limit: 200 })
  if (error) {
    console.error('send-push-notifications: _push_delivery_queue failed', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }

  // Group the flat (alert x subscription) rows by alert.
  const byAlert = new Map<string, { alert: Record<string, unknown>; subs: Record<string, unknown>[] }>()
  for (const row of rows ?? []) {
    const key = row.alert_id as string
    if (!byAlert.has(key)) byAlert.set(key, { alert: row, subs: [] })
    if (row.subscription_id) byAlert.get(key)!.subs.push(row)
  }

  const staleEndpoints = new Set<string>()
  const pushedAlertIds: string[] = []

  for (const { alert, subs } of byAlert.values()) {
    const payload = JSON.stringify({
      title: alert.title,
      body: alert.body ?? '',
      severity: alert.severity,
      url: urlForAlert(alert.type as string),
    })

    // No devices registered for this user — nothing to deliver, but still
    // mark it pushed so this alert doesn't get rescanned forever.
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
            payload,
          )
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode
          if (status === 404 || status === 410) {
            staleEndpoints.add(s.endpoint as string)
          } else {
            console.error('send-push-notifications: delivery failed', alert.id, status, err)
          }
        }
      }),
    )
    pushedAlertIds.push(alert.id as string)
  }

  if (pushedAlertIds.length > 0) {
    const { error: markErr } = await db.rpc('_mark_alerts_pushed', { p_ids: pushedAlertIds })
    if (markErr) console.error('send-push-notifications: _mark_alerts_pushed failed', markErr)
  }
  for (const endpoint of staleEndpoints) {
    const { error: purgeErr } = await db.rpc('_purge_push_subscription', { p_endpoint: endpoint })
    if (purgeErr) console.error('send-push-notifications: _purge_push_subscription failed', purgeErr)
  }

  return new Response(
    JSON.stringify({ ok: true, alerts_processed: pushedAlertIds.length, stale_subscriptions_removed: staleEndpoints.size }),
    { status: 200 },
  )
})
