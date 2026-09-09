-- 046: fix custom-plan checkout linking the subscriber to the WRONG plan
--      row after payment.
--
-- Root cause: admin_send_custom_plan_quote() correctly creates a per-quote
-- subscription_plans row with the real negotiated price (slug
-- 'custom-<quote-id>', e.g. Rs.99/mo) -- but the webhook that activates the
-- subscription after Razorpay payment (subscription-webhook/index.ts)
-- hardcodes its plan lookup to the literal string 'custom', a DIFFERENT,
-- generic, shared plan row (Rs.0). So a paying custom-plan customer's
-- user_subscriptions.plan_id ends up pointing at the Rs.0 shared row, not
-- their own Rs.99 quote's row -- Razorpay charged the right amount, but
-- MoneyFlow's own database silently disagreed about which plan they're on
-- (wrong price shown in the admin Subscriptions list, and potentially the
-- wrong features/limits enforced, since those also live on the per-quote
-- row).
--
-- Fix lives entirely in apply_subscription_webhook_event() (the SECURITY
-- DEFINER RPC the webhook calls) rather than the Edge Function itself, so
-- it takes effect immediately via this migration alone -- no Edge Function
-- redeploy required. p_custom_plan_request_id was already being passed
-- through on every custom-plan webhook event; this just also uses it to
-- resolve the REAL plan for that request (its most recently sent quote)
-- before ever falling back to the generic p_resolved_plan_slug lookup,
-- which stays exactly as-is for a regular Free/Pro checkout.
create or replace function public.apply_subscription_webhook_event(
  p_user_id uuid,
  p_event_type text,
  p_provider_event_id text,
  p_payload jsonb,
  p_next_status text,             -- null means "log only, no status change"
  p_provider text,
  p_resolved_plan_slug text,       -- 'custom' or the regular plan slug; only used when p_next_status = 'active'
  p_billing_cycle text,
  p_customer_id text,
  p_subscription_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_custom_plan_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id uuid;
  v_plan_id uuid;
begin
  -- Idempotency: a redelivered webhook with the same provider_event_id must
  -- never be processed twice.
  if p_provider_event_id is not null and exists (
    select 1 from subscription_events where provider_event_id = p_provider_event_id
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select id into v_sub_id from user_subscriptions where user_id = p_user_id;

  -- Always log the raw event, whether or not its type is recognised.
  insert into subscription_events (user_id, subscription_id, event_type, provider_event_id, payload)
  values (p_user_id, v_sub_id, p_event_type, p_provider_event_id, p_payload);

  if p_next_status is null then
    return jsonb_build_object('ok', true, 'ignored', true);
  end if;

  if p_next_status = 'active' then
    v_plan_id := null;

    -- Custom plan: resolve the REAL plan for this specific request (its
    -- most recently sent quote's own subscription_plans row) -- never the
    -- generic 'custom' string. A request can accumulate several quotes
    -- over time (history preserved, never overwritten); the most recently
    -- SENT one (subscription_plan_id is only ever set by
    -- admin_send_custom_plan_quote) is the one whose terms the customer
    -- actually paid for.
    if p_custom_plan_request_id is not null then
      select q.subscription_plan_id into v_plan_id
      from public.custom_plan_quotes q
      where q.request_id = p_custom_plan_request_id
        and q.subscription_plan_id is not null
      order by q.created_at desc
      limit 1;
    end if;

    -- Regular Free/Pro checkout (or a custom request whose quote lookup
    -- somehow came up empty) -- unchanged from before.
    if v_plan_id is null then
      select id into v_plan_id from subscription_plans where slug = p_resolved_plan_slug;
    end if;

    update user_subscriptions set
      status = 'active',
      provider = p_provider,
      plan_id = coalesce(v_plan_id, plan_id),
      billing_cycle = p_billing_cycle,
      cancel_at_period_end = false,
      cancelled_at = null,
      provider_customer_id = coalesce(p_customer_id, provider_customer_id),
      provider_subscription_id = coalesce(p_subscription_id, provider_subscription_id),
      current_period_start = coalesce(p_period_start, current_period_start),
      current_period_end = coalesce(p_period_end, current_period_end),
      updated_at = now()
    where user_id = p_user_id;
  else
    update user_subscriptions set
      status = p_next_status,
      provider = p_provider,
      cancelled_at = case when p_next_status in ('cancelled', 'expired') then now() else cancelled_at end,
      updated_at = now()
    where user_id = p_user_id;
  end if;

  -- Custom Plan / Request-a-Quote linkage: flip the offer to active on first
  -- successful charge. The status = 'payment_pending' guard makes this a
  -- no-op on later renewal charges (already 'active') and on any
  -- redelivered/duplicate webhook.
  if p_next_status = 'active' and p_custom_plan_request_id is not null then
    update custom_plan_requests set
      status = 'active',
      provider = p_provider,
      provider_subscription_id = coalesce(p_subscription_id, provider_subscription_id),
      updated_at = now()
    where id = p_custom_plan_request_id and status = 'payment_pending';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.apply_subscription_webhook_event(
  uuid, text, text, jsonb, text, text, text, text, text, text, timestamptz, timestamptz, uuid
) to anon, authenticated;
