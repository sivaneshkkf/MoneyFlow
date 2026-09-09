-- 048: admin_get_dashboard_stats()'s MRR/ARR only ever summed active
--      subscribers on slug = 'pro' -- a custom-plan subscriber (real
--      revenue, e.g. Rs.99/mo) was invisible to it entirely, on top of the
--      same "shared marker plan has price 0" issue 047 just fixed for the
--      Subscriptions list. Same fix, same provider_subscription_id join to
--      custom_plan_requests for the real admin_price.
--
-- Rs.199 (pro) + Rs.99 (custom) = Rs.298 MRR, not Rs.199.
create or replace function public.admin_get_dashboard_stats()
returns table (
  total_users int, active_users int, suspended_users int,
  free_users int, pro_users int,
  active_subscriptions int, trialing_subscriptions int, past_due_subscriptions int, cancelled_subscriptions int,
  new_users_7d int, new_users_30d int,
  mrr numeric, arr numeric, currency text
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
      (select count(*)::int from public.profiles),
      (select count(*)::int from public.profiles where status = 'active'),
      (select count(*)::int from public.profiles where status = 'suspended'),
      (select count(*)::int from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id where p.slug = 'free'),
      (select count(*)::int from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id where p.slug = 'pro' and us.status in ('active', 'trialing')),
      (select count(*)::int from public.user_subscriptions where status = 'active'),
      (select count(*)::int from public.user_subscriptions where status = 'trialing'),
      (select count(*)::int from public.user_subscriptions where status = 'past_due'),
      (select count(*)::int from public.user_subscriptions where status = 'cancelled'),
      (select count(*)::int from public.profiles where created_at >= now() - interval '7 days'),
      (select count(*)::int from public.profiles where created_at >= now() - interval '30 days'),
      coalesce((
        -- Pro subscribers: plan price as before.
        select sum(case when us.billing_cycle = 'yearly' then p.price_yearly / 12.0 else p.price_monthly end)
        from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id
        where p.slug = 'pro' and us.status = 'active'
      ), 0)
      + coalesce((
        -- Custom-plan subscribers: real negotiated price from
        -- custom_plan_requests (the shared 'custom' marker plan's own
        -- price is always 0), matched via provider_subscription_id --
        -- same join 047 already uses for the Subscriptions list.
        select sum(case when coalesce(cpr.billing_cycle, us.billing_cycle) = 'yearly'
                        then cpr.admin_price / 12.0 else cpr.admin_price end)
        from public.user_subscriptions us
        join public.subscription_plans p on p.id = us.plan_id
        join public.custom_plan_requests cpr
          on cpr.provider_subscription_id is not null
          and cpr.provider_subscription_id = us.provider_subscription_id
        where p.slug = 'custom' and us.status = 'active' and cpr.admin_price is not null
      ), 0) as mrr,
      coalesce((
        select sum(case when us.billing_cycle = 'yearly' then p.price_yearly else p.price_monthly * 12 end)
        from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id
        where p.slug = 'pro' and us.status = 'active'
      ), 0)
      + coalesce((
        select sum(case when coalesce(cpr.billing_cycle, us.billing_cycle) = 'yearly'
                        then cpr.admin_price else cpr.admin_price * 12 end)
        from public.user_subscriptions us
        join public.subscription_plans p on p.id = us.plan_id
        join public.custom_plan_requests cpr
          on cpr.provider_subscription_id is not null
          and cpr.provider_subscription_id = us.provider_subscription_id
        where p.slug = 'custom' and us.status = 'active' and cpr.admin_price is not null
      ), 0) as arr,
      'INR';
end;
$$;
