-- 026_admin_email_cast_fix.sql
-- =========================================================================
-- Fix: auth.users.email is `character varying(255)`, not `text`. PL/pgSQL's
-- RETURN QUERY requires an EXACT type match against the function's declared
-- RETURNS TABLE column types (no implicit varchar -> text coercion), so
-- every admin RPC that selects u.email/au.email/tu.email into an `email
-- text` output column failed with:
--   42804  structure of query does not match function result type
--   Returned type character varying(255) does not match expected type text
--
-- Fix: cast every auth.users email reference to ::text. No behavioural or
-- signature change otherwise — same left-join fix from 025 is preserved.
-- =========================================================================

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
    select u.id, u.email::text, p.full_name, p.avatar_url,
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
    select u.id, u.email::text, p.full_name, p.avatar_url,
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
    select us.id, us.user_id, u.email::text, p.full_name,
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
    select r.user_id, u.email::text, p.full_name, r.role, r.created_at, r.created_by
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    order by r.role, r.created_at;
end;
$$;

create or replace function public.admin_list_payments(
  p_event_type text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  event_id uuid, user_id uuid, email text, event_type text, provider_event_id text,
  payload jsonb, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select e.id, e.user_id, u.email::text, e.event_type, e.provider_event_id, e.payload, e.created_at,
           count(*) over ()::bigint
    from public.subscription_events e
    left join auth.users u on u.id = e.user_id
    where p_event_type is null or p_event_type = '' or e.event_type = p_event_type
    order by e.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_list_audit_logs(
  p_admin_user uuid default null,
  p_action text default null,
  p_target_user uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  log_id uuid, admin_user_id uuid, admin_email text, action text,
  target_user_id uuid, target_email text, resource_type text, resource_id uuid,
  metadata jsonb, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select l.id, l.admin_user_id, au.email::text, l.action, l.target_user_id, tu.email::text,
           l.resource_type, l.resource_id, l.metadata, l.created_at,
           count(*) over ()::bigint
    from public.admin_audit_logs l
    left join auth.users au on au.id = l.admin_user_id
    left join auth.users tu on tu.id = l.target_user_id
    where (p_admin_user is null or l.admin_user_id = p_admin_user)
      and (p_action is null or p_action = '' or l.action = p_action)
      and (p_target_user is null or l.target_user_id = p_target_user)
      and (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at <= p_to)
    order by l.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

notify pgrst, 'reload schema';
