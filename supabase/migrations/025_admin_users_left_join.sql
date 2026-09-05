-- 025_admin_users_left_join.sql
-- =========================================================================
-- Fix: admin_list_users / admin_get_user_details / admin_list_subscriptions /
-- admin_list_admins used an INNER join to public.profiles. Since a profile
-- row can legitimately be missing (the regular app already tolerates this —
-- see useProfile()'s synthesized fallback), any account without one was
-- silently dropped from every admin list, including the currently signed-in
-- super admin. No error was raised — the queries just returned fewer rows,
-- which is why the previous error-state fix didn't surface anything.
--
-- Fix: (1) backfill any missing profiles rows the same way handle_new_user()
-- (001) already does for new signups, and (2) switch these RPCs to LEFT JOIN
-- with coalesced fallbacks, so an account is never excluded just because its
-- profile row is missing.
-- =========================================================================

-- 1. Backfill — idempotent, mirrors handle_new_user().
insert into public.profiles (id, email, full_name, avatar_url)
select u.id, u.email,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
       u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 2. admin_list_users — LEFT JOIN profiles.
create or replace function public.admin_list_users(
  p_search text default null,
  p_plan_slug text default null,
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  user_id uuid, email text, full_name text, avatar_url text, status text,
  created_at timestamptz, plan_slug text, plan_name text, subscription_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email, p.full_name, p.avatar_url,
           coalesce(p.status, 'active'),
           coalesce(p.created_at, u.created_at),
           sp.slug, sp.name, us.status,
           count(*) over ()::bigint
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%')
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
      and (p_status is null or p_status = '' or coalesce(p.status, 'active') = p_status)
    order by coalesce(p.created_at, u.created_at) desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

-- 3. admin_get_user_details — LEFT JOIN profiles.
create or replace function public.admin_get_user_details(p_user uuid)
returns table (
  user_id uuid, email text, full_name text, avatar_url text, status text, created_at timestamptz,
  last_sign_in_at timestamptz,
  plan_slug text, plan_name text, subscription_status text, billing_cycle text,
  current_period_end timestamptz, cancel_at_period_end boolean, trial_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email, p.full_name, p.avatar_url,
           coalesce(p.status, 'active'), coalesce(p.created_at, u.created_at), u.last_sign_in_at,
           sp.slug, sp.name, us.status, us.billing_cycle,
           us.current_period_end, us.cancel_at_period_end, us.trial_end
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where u.id = p_user;
end;
$$;

-- 4. admin_list_subscriptions — LEFT JOIN profiles (a subscription can exist
--    for a user whose profile row is missing).
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
    select us.id, us.user_id, u.email, p.full_name,
           sp.slug, sp.name, sp.price_monthly, sp.price_yearly,
           us.status, us.billing_cycle, us.current_period_start, us.current_period_end,
           us.cancel_at_period_end, us.provider, us.created_at,
           count(*) over ()::bigint
    from public.user_subscriptions us
    join auth.users u on u.id = us.user_id
    left join public.profiles p on p.id = us.user_id
    join public.subscription_plans sp on sp.id = us.plan_id
    where (p_status is null or p_status = '' or us.status = p_status)
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
    order by us.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

-- 5. admin_list_admins — LEFT JOIN profiles (an admin's own profile row
--    should never hide them from the admin roster).
create or replace function public.admin_list_admins()
returns table (user_id uuid, email text, full_name text, role text, granted_at timestamptz, granted_by uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select r.user_id, u.email, p.full_name, r.role, r.created_at, r.created_by
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    order by r.role, r.created_at;
end;
$$;

notify pgrst, 'reload schema';
