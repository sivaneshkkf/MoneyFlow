-- 047: correct 046, which was based on a misreading of the migration
--      history file rather than what's actually deployed.
--
-- The real schema (confirmed by direct inspection) has NO custom_plan_quotes
-- table and no per-request subscription_plans row at all. Every custom-plan
-- subscriber intentionally shares ONE generic 'custom' marker plan row
-- (price 0, is_active false) -- the real negotiated terms live directly on
-- custom_plan_requests (admin_price, billing_cycle, requested_price). That
-- linkage was correct all along; 046 never should have touched it.
--
-- PART 1 -- revert apply_subscription_webhook_event() to not reference
-- custom_plan_quotes at all. 046's version would fail at RUNTIME the next
-- time a custom-plan webhook actually fires (Postgres doesn't validate a
-- plpgsql body's table references at CREATE time, only when it executes) --
-- this must go out before that happens for real.
--
-- PART 2 -- the ACTUAL bug: admin_list_subscriptions() showed the shared
-- marker plan's price (0) instead of the real price on the matching
-- custom_plan_requests row. Joins on provider_subscription_id (populated on
-- both user_subscriptions and custom_plan_requests by the same Razorpay
-- subscription id -- the precise, unambiguous match key) and shows
-- admin_price for a 'custom'-slug subscription instead of the marker's own
-- price_monthly/price_yearly.

-- ---------------------------------------------------------------------------
-- Part 1: revert to the pre-046 body.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Part 2: the real fix — show the real price for a custom-plan subscriber.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_subscriptions(text, text, int, int);
create or replace function public.admin_list_subscriptions(
  p_status text default null,
  p_plan_slug text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  subscription_id uuid, user_id uuid, email text, full_name text,
  plan_slug text, plan_name text, price_monthly numeric, price_yearly numeric,
  status text, billing_cycle text, current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean, provider text, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select
      us.id, us.user_id, u.email::text, p.full_name,
      sp.slug, sp.name,
      case
        when sp.slug = 'custom' and cpr.admin_price is not null
          then case when coalesce(cpr.billing_cycle, us.billing_cycle) = 'yearly'
                     then round(cpr.admin_price / 12, 2) else cpr.admin_price end
        else sp.price_monthly
      end as price_monthly,
      case
        when sp.slug = 'custom' and cpr.admin_price is not null
          then case when coalesce(cpr.billing_cycle, us.billing_cycle) = 'yearly'
                     then cpr.admin_price else round(cpr.admin_price * 12, 2) end
        else sp.price_yearly
      end as price_yearly,
      us.status, us.billing_cycle, us.current_period_start, us.current_period_end,
      us.cancel_at_period_end, us.provider, us.created_at,
      count(*) over ()::bigint
    from public.user_subscriptions us
    join auth.users u on u.id = us.user_id
    left join public.profiles p on p.id = us.user_id
    join public.subscription_plans sp on sp.id = us.plan_id
    left join public.custom_plan_requests cpr
      on sp.slug = 'custom'
      and cpr.provider_subscription_id is not null
      and cpr.provider_subscription_id = us.provider_subscription_id
    where (p_status is null or p_status = '' or us.status = p_status)
      and (
        p_plan_slug is null or p_plan_slug = ''
        or (p_plan_slug = 'custom' and sp.slug like 'custom%')
        or sp.slug = p_plan_slug
      )
    order by us.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

grant execute on function public.admin_list_subscriptions(text, text, int, int) to authenticated;
