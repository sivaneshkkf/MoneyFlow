-- 024_admin_system.sql
-- =========================================================================
-- Super Admin system.
--
-- Role-based, database-backed authorization — never email-based, never
-- trusted from the frontend. Every admin RPC calls require_admin() /
-- require_super_admin() as its first statement and re-derives the caller
-- from auth.uid(); a role claimed by the client is never honoured.
--
-- Reuses the existing subscription system (subscription_plans,
-- user_subscriptions, subscription_events, get_subscription_usage's logic)
-- rather than duplicating it. Does not touch account/transaction/lending/
-- bill accounting.
--
-- User suspension is enforced the officially-supported Supabase way (Auth
-- ban via the service-role Admin API, from the admin-actions Edge Function)
-- rather than retrofitting a status check onto every existing RLS policy in
-- the app — see the note above admin-actions/index.ts for why.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Roles.
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'super_admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (user_id, role)
);

create index if not exists idx_user_roles_user on public.user_roles (user_id);

-- Display-only account status. The enforced ban lives in Supabase Auth
-- (auth.users.banned_until) via the admin-actions Edge Function; this column
-- lets the UI show/filter status without an extra round trip.
alter table public.profiles
  add column if not exists status text not null default 'active' check (status in ('active', 'suspended'));

-- ---------------------------------------------------------------------------
-- 2. Audit log. Append-only from the client's point of view — every write
--    happens inside a SECURITY DEFINER admin RPC (or the Edge Function),
--    never directly.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.admin_audit_logs (created_at desc);
create index if not exists idx_audit_logs_admin on public.admin_audit_logs (admin_user_id, created_at desc);
create index if not exists idx_audit_logs_target on public.admin_audit_logs (target_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Role helpers. STABLE + SECURITY DEFINER so they can be used inside RLS
--    policies and other functions without a recursive-RLS problem on
--    user_roles itself.
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_user uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = p_user and role = p_role);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'super_admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'admin');
$$;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.require_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS.
--    user_roles / admin_audit_logs: admins may SELECT; nobody writes
--    directly (RPCs + the Edge Function, both SECURITY DEFINER / service
--    role, are the only doors).
-- ---------------------------------------------------------------------------
alter table public.user_roles enable row level security;
drop policy if exists "admin_select" on public.user_roles;
create policy "admin_select" on public.user_roles for select using (public.is_admin());
revoke insert, update, delete on public.user_roles from authenticated, anon;

alter table public.admin_audit_logs enable row level security;
drop policy if exists "admin_select" on public.admin_audit_logs;
create policy "admin_select" on public.admin_audit_logs for select using (public.is_admin());
revoke insert, update, delete on public.admin_audit_logs from authenticated, anon;

-- Admins may additionally see inactive plans (regular users still only see
-- is_active ones — this ADDS a policy, it does not touch the existing one;
-- Postgres OR-combines multiple permissive SELECT policies).
drop policy if exists "plans_select_admin" on public.subscription_plans;
create policy "plans_select_admin" on public.subscription_plans for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Internal audit helper — used by every sensitive admin RPC below.
-- ---------------------------------------------------------------------------
create or replace function public._log_admin_action(
  p_action text, p_target_user uuid, p_resource_type text, p_resource_id uuid, p_metadata jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_audit_logs (admin_user_id, action, target_user_id, resource_type, resource_id, metadata)
  values (auth.uid(), p_action, p_target_user, p_resource_type, p_resource_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- 6. Reuse, don't duplicate: extract the usage calculation from the existing
--    get_subscription_usage() (023) into a parameterised internal function,
--    then make get_subscription_usage() a thin wrapper over it. Behaviour
--    and output for the existing personal endpoint are unchanged.
-- ---------------------------------------------------------------------------
create or replace function public._subscription_usage_for(p_user uuid)
returns table (resource text, used int, limit_value int, unlimited boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limits jsonb;
  v_accounts int; v_budgets int; v_bills int; v_lending int; v_tx int;
  v_l_accounts int; v_l_budgets int; v_l_bills int; v_l_lending int; v_l_tx int;
begin
  select p.limits into v_limits
  from public.user_subscriptions s join public.subscription_plans p on p.id = s.plan_id
  where s.user_id = p_user;
  if v_limits is null then
    select limits into v_limits from public.subscription_plans where slug = 'free';
  end if;

  select count(*) into v_accounts from public.accounts where user_id = p_user;
  select count(*) into v_budgets from public.budgets
    where user_id = p_user
      and year = extract(year from current_date)::int
      and month = extract(month from current_date)::int;
  select count(*) into v_bills from public.recurring_transactions
    where user_id = p_user and status = 'active';
  select count(*) into v_lending from public.lending_records
    where user_id = p_user and status not in ('cancelled', 'written_off');
  select count(*) into v_tx from public.transactions
    where user_id = p_user and source = 'manual'
      and transaction_date >= date_trunc('month', current_date)::date
      and transaction_date < (date_trunc('month', current_date) + interval '1 month')::date;

  v_l_accounts := coalesce((v_limits->>'accounts')::int, -1);
  v_l_budgets  := coalesce((v_limits->>'budgets')::int, -1);
  v_l_bills    := coalesce((v_limits->>'bills')::int, -1);
  v_l_lending  := coalesce((v_limits->>'lending_records')::int, -1);
  v_l_tx       := coalesce((v_limits->>'transactions_per_month')::int, -1);

  return query
    select 'accounts'::text, v_accounts, v_l_accounts, (v_l_accounts = -1)
    union all
    select 'budgets', v_budgets, v_l_budgets, (v_l_budgets = -1)
    union all
    select 'bills', v_bills, v_l_bills, (v_l_bills = -1)
    union all
    select 'lending_records', v_lending, v_l_lending, (v_l_lending = -1)
    union all
    select 'transactions_per_month', v_tx, v_l_tx, (v_l_tx = -1);
end;
$$;

create or replace function public.get_subscription_usage()
returns table (resource text, used int, limit_value int, unlimited boolean)
language sql
stable
security definer
set search_path = public
as $$
  select * from public._subscription_usage_for(auth.uid());
$$;

grant execute on function public.get_subscription_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Users: list, detail, usage, gated financial snapshot.
-- ---------------------------------------------------------------------------
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
    select u.id, u.email, p.full_name, p.avatar_url, p.status, p.created_at,
           sp.slug, sp.name, us.status,
           count(*) over ()::bigint
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%')
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
      and (p_status is null or p_status = '' or p.status = p_status)
    order by p.created_at desc
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
    select u.id, u.email, p.full_name, p.avatar_url, p.status, p.created_at, u.last_sign_in_at,
           sp.slug, sp.name, us.status, us.billing_cycle,
           us.current_period_end, us.cancel_at_period_end, us.trial_end
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where u.id = p_user;
end;
$$;

create or replace function public.admin_get_user_usage(p_user uuid)
returns table (resource text, used int, limit_value int, unlimited boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query select * from public._subscription_usage_for(p_user);
end;
$$;

-- Explicit, audited, summarised only (never a raw data dump) — see spec §13.
create or replace function public.admin_view_financial_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'account_count', (select count(*) from public.accounts where user_id = p_user),
    'total_balance', (select coalesce(sum(current_balance), 0) from public.accounts where user_id = p_user and is_active),
    'active_bills', (select count(*) from public.recurring_transactions where user_id = p_user and status = 'active'),
    'active_lending', (select count(*) from public.lending_records where user_id = p_user and status not in ('cancelled', 'written_off')),
    'lending_outstanding', (select coalesce(sum(outstanding_principal + outstanding_interest), 0)
                             from public.lending_records where user_id = p_user and status not in ('cancelled', 'written_off')),
    'recent_transactions', (
      select coalesce(jsonb_agg(t order by t.transaction_date desc), '[]'::jsonb)
      from (
        select type, amount, description, transaction_date
        from public.transactions where user_id = p_user
        order by transaction_date desc limit 10
      ) t
    )
  ) into v_result;

  perform public._log_admin_action('FINANCIAL_DATA_VIEWED', p_user, 'user_financial_data', p_user, '{}'::jsonb);

  return v_result;
end;
$$;

grant execute on function public.admin_list_users(text, text, text, int, int) to authenticated;
grant execute on function public.admin_get_user_details(uuid) to authenticated;
grant execute on function public.admin_get_user_usage(uuid) to authenticated;
grant execute on function public.admin_view_financial_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Subscriptions & plans (reusing the existing tables — no parallel schema).
-- ---------------------------------------------------------------------------
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
    join public.profiles p on p.id = us.user_id
    join public.subscription_plans sp on sp.id = us.plan_id
    where (p_status is null or p_status = '' or us.status = p_status)
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
    order by us.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_change_user_plan(p_user uuid, p_plan_slug text, p_billing_cycle text, p_reason text default null)
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans;
  v_sub public.user_subscriptions;
  v_before text;
begin
  perform public.require_super_admin();

  select * into v_plan from public.subscription_plans where slug = p_plan_slug and is_active;
  if not found then raise exception 'Unknown plan'; end if;
  if p_billing_cycle not in ('monthly', 'yearly') then raise exception 'Invalid billing cycle'; end if;

  select status into v_before from public.user_subscriptions where user_id = p_user;

  update public.user_subscriptions set
    plan_id = v_plan.id,
    billing_cycle = p_billing_cycle,
    status = 'active',
    cancel_at_period_end = false,
    cancelled_at = null,
    current_period_start = now(),
    current_period_end = now() + case when p_billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end,
    updated_at = now()
  where user_id = p_user
  returning * into v_sub;

  if not found then raise exception 'Subscription not found for this user'; end if;

  perform public._log_admin_action('PLAN_CHANGED', p_user, 'user_subscriptions', v_sub.id,
    jsonb_build_object('from_status', v_before, 'to_plan', p_plan_slug, 'billing_cycle', p_billing_cycle, 'reason', p_reason));

  return v_sub;
end;
$$;

create or replace function public.admin_cancel_subscription(p_user uuid, p_reason text default null)
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare v_sub public.user_subscriptions;
begin
  perform public.require_admin();
  update public.user_subscriptions
    set cancel_at_period_end = true, cancelled_at = now(), updated_at = now()
    where user_id = p_user and status in ('active', 'trialing', 'past_due')
    returning * into v_sub;
  if not found then raise exception 'No active subscription to cancel'; end if;

  perform public._log_admin_action('SUBSCRIPTION_CANCELLED', p_user, 'user_subscriptions', v_sub.id,
    jsonb_build_object('reason', p_reason));
  return v_sub;
end;
$$;

create or replace function public.admin_resume_subscription(p_user uuid, p_reason text default null)
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare v_sub public.user_subscriptions;
begin
  perform public.require_admin();
  update public.user_subscriptions
    set cancel_at_period_end = false, cancelled_at = null, updated_at = now()
    where user_id = p_user and cancel_at_period_end = true and status in ('active', 'trialing', 'past_due')
    returning * into v_sub;
  if not found then raise exception 'No pending cancellation to resume'; end if;

  perform public._log_admin_action('SUBSCRIPTION_RESUMED', p_user, 'user_subscriptions', v_sub.id,
    jsonb_build_object('reason', p_reason));
  return v_sub;
end;
$$;

create or replace function public.admin_update_plan(
  p_plan_id uuid, p_name text, p_description text,
  p_price_monthly numeric, p_price_yearly numeric, p_currency text,
  p_features jsonb, p_limits jsonb, p_is_active boolean, p_sort_order int
)
returns public.subscription_plans
language plpgsql
security definer
set search_path = public
as $$
declare v_plan public.subscription_plans;
begin
  perform public.require_super_admin();
  if p_price_monthly < 0 or p_price_yearly < 0 then raise exception 'Price cannot be negative'; end if;

  -- Plan configuration only. This never touches user_subscriptions rows, so
  -- nobody's billing history or currently-locked-in price changes.
  update public.subscription_plans set
    name = p_name, description = p_description,
    price_monthly = p_price_monthly, price_yearly = p_price_yearly, currency = p_currency,
    features = p_features, limits = p_limits, is_active = p_is_active, sort_order = p_sort_order,
    updated_at = now()
  where id = p_plan_id
  returning * into v_plan;

  if not found then raise exception 'Plan not found'; end if;

  perform public._log_admin_action('PLAN_UPDATED', null, 'subscription_plans', v_plan.id,
    jsonb_build_object('slug', v_plan.slug));
  return v_plan;
end;
$$;

grant execute on function public.admin_list_subscriptions(text, text, int, int) to authenticated;
grant execute on function public.admin_change_user_plan(uuid, text, text, text) to authenticated;
grant execute on function public.admin_cancel_subscription(uuid, text) to authenticated;
grant execute on function public.admin_resume_subscription(uuid, text) to authenticated;
grant execute on function public.admin_update_plan(uuid, text, text, numeric, numeric, text, jsonb, jsonb, boolean, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Payments (subscription_events — no invented amounts; only what the
--    (future) webhook actually recorded).
-- ---------------------------------------------------------------------------
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
    select e.id, e.user_id, u.email, e.event_type, e.provider_event_id, e.payload, e.created_at,
           count(*) over ()::bigint
    from public.subscription_events e
    left join auth.users u on u.id = e.user_id
    where p_event_type is null or p_event_type = '' or e.event_type = p_event_type
    order by e.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

grant execute on function public.admin_list_payments(text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Audit log viewer.
-- ---------------------------------------------------------------------------
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
    select l.id, l.admin_user_id, au.email, l.action, l.target_user_id, tu.email,
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

grant execute on function public.admin_list_audit_logs(uuid, text, uuid, timestamptz, timestamptz, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Dashboard stats + growth series. Real aggregates only; MRR/ARR are
--     computed from actual user_subscriptions rows (naturally 0 until real
--     Pro subscriptions exist — never invented).
-- ---------------------------------------------------------------------------
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
        select sum(case when us.billing_cycle = 'yearly' then p.price_yearly / 12.0 else p.price_monthly end)
        from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id
        where p.slug = 'pro' and us.status = 'active'
      ), 0),
      coalesce((
        select sum(case when us.billing_cycle = 'yearly' then p.price_yearly else p.price_monthly * 12 end)
        from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id
        where p.slug = 'pro' and us.status = 'active'
      ), 0),
      'INR';
end;
$$;

create or replace function public.admin_user_growth(p_days int default 30)
returns table (day date, new_users int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select d::date, coalesce(c.n, 0)::int
    from generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day') d
    left join (
      select created_at::date as day, count(*) as n from public.profiles group by 1
    ) c on c.day = d::date
    order by 1;
end;
$$;

create or replace function public.admin_subscription_growth(p_days int default 30)
returns table (day date, new_pro int, cancelled int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select d::date,
           coalesce(np.n, 0)::int,
           coalesce(cx.n, 0)::int
    from generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day') d
    left join (
      select l.created_at::date as day, count(*) as n
      from public.admin_audit_logs l where l.action = 'PLAN_CHANGED'
      group by 1
    ) np on np.day = d::date
    left join (
      select l.created_at::date as day, count(*) as n
      from public.admin_audit_logs l where l.action = 'SUBSCRIPTION_CANCELLED'
      group by 1
    ) cx on cx.day = d::date
    order by 1;
end;
$$;

grant execute on function public.admin_get_dashboard_stats() to authenticated;
grant execute on function public.admin_user_growth(int) to authenticated;
grant execute on function public.admin_subscription_growth(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Admin/role management. Extremely careful with the last super_admin.
-- ---------------------------------------------------------------------------
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
    join public.profiles p on p.id = r.user_id
    order by r.role, r.created_at;
end;
$$;

create or replace function public.admin_grant_role(p_user uuid, p_role text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_super_admin();
  if p_role not in ('admin', 'super_admin') then raise exception 'Invalid role'; end if;

  insert into public.user_roles (user_id, role, created_by)
    values (p_user, p_role, auth.uid())
    on conflict (user_id, role) do nothing;

  perform public._log_admin_action('ROLE_GRANTED', p_user, 'user_roles', p_user,
    jsonb_build_object('role', p_role, 'reason', p_reason));
end;
$$;

create or replace function public.admin_revoke_role(p_user uuid, p_role text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_remaining int;
begin
  perform public.require_super_admin();
  if p_role not in ('admin', 'super_admin') then raise exception 'Invalid role'; end if;

  if p_role = 'super_admin' then
    select count(*) into v_remaining from public.user_roles where role = 'super_admin';
    if v_remaining <= 1 and public.has_role(p_user, 'super_admin') then
      raise exception 'Cannot remove the last Super Admin';
    end if;
  end if;

  delete from public.user_roles where user_id = p_user and role = p_role;

  perform public._log_admin_action('ROLE_REVOKED', p_user, 'user_roles', p_user,
    jsonb_build_object('role', p_role, 'reason', p_reason));
end;
$$;

grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_grant_role(uuid, text, text) to authenticated;
grant execute on function public.admin_revoke_role(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================================
-- First Super Admin — manual, one-time setup. NOT exposed anywhere in the
-- app UI. Run this once in the Supabase SQL editor, replacing the email:
--
--   insert into public.user_roles (user_id, role)
--   select id, 'super_admin' from auth.users where email = 'YOUR_ADMIN_EMAIL'
--   on conflict (user_id, role) do nothing;
--
-- Verify with:  select * from public.user_roles;
-- =========================================================================
