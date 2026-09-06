-- 030_subscription_webhook_rpc.sql
-- =========================================================================
-- Moves the subscription-webhook Edge Function's privileged writes
-- (subscription_events insert, user_subscriptions update, custom_plan_requests
-- flip-to-active) into a single SECURITY DEFINER RPC.
--
-- Why: this project's Supabase "Secret key" (the newer replacement for the
-- legacy service_role JWT) was found NOT to carry real elevated table
-- privileges when used directly via supabase-js/PostgREST on this project
-- (confirmed via direct testing — every write hit "permission denied for
-- table ..."). A SECURITY DEFINER function sidesteps that entirely: it runs
-- with the privileges of whoever owns the function (the migration role),
-- regardless of which Postgres role the caller's API key resolves to, as
-- long as EXECUTE is granted — which is already true for anon/authenticated
-- (see 015_grants.sql). This is the same pattern already used everywhere
-- else in this app for admin-only mutations.
-- =========================================================================

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
    select id into v_plan_id from subscription_plans where slug = p_resolved_plan_slug;
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

notify pgrst, 'reload schema';
