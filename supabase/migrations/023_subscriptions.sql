-- 023_subscriptions.sql
-- =========================================================================
-- Subscription & Plans system (Free / Pro).
--
-- Database-driven: plan prices/features/limits live in subscription_plans,
-- never hardcoded in React. Every user has exactly one user_subscriptions
-- row (auto-provisioned to Free); subscription_events is an append-only,
-- idempotent log for payment-provider webhooks.
--
-- Trust boundary: authenticated users get SELECT only on user_subscriptions /
-- subscription_events (RLS + explicit REVOKE of write grants). Status, plan,
-- billing period and provider ids can only change through SECURITY DEFINER
-- RPCs or a service-role webhook — never directly from the browser.
--
-- This module does not touch account balances, transactions' financial
-- meaning, lending, bills or EMI accounting. It only adds a BEFORE INSERT
-- guard on accounts/budgets/recurring_transactions/lending_records/
-- transactions that blocks a NEW row once a Free-plan limit is reached; it
-- never touches existing rows, balances or the values a row is inserted with,
-- and it never blocks system-generated transactions (bill/EMI/lending
-- postings) — only source = 'manual' entries count toward the monthly cap.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Plans (database-driven; -1 in `limits` means unlimited, consistently).
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug = lower(slug)),
  description text,
  price_monthly numeric(10,2) not null default 0 check (price_monthly >= 0),
  price_yearly numeric(10,2) not null default 0 check (price_yearly >= 0),
  currency text not null default 'INR',
  features jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. One subscription per user.
-- ---------------------------------------------------------------------------
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'active'
    check (status in ('trialing','active','past_due','paused','cancelled','expired')),
  billing_cycle text check (billing_cycle in ('monthly','yearly')),
  provider text,                       -- e.g. 'razorpay' | 'stripe' | 'cashfree'; null until integrated
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_start timestamptz,
  trial_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_subscriptions_status on public.user_subscriptions (status);
create index if not exists idx_user_subscriptions_provider_sub
  on public.user_subscriptions (provider_subscription_id) where provider_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Append-only webhook/lifecycle log. provider_event_id is unique so a
--    redelivered webhook can never be processed twice.
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_subscription_events_provider_event
  on public.subscription_events (provider_event_id) where provider_event_id is not null;
create index if not exists idx_subscription_events_user on public.subscription_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. RLS.
--    subscription_plans : anyone may read active plans (pricing page).
--    user_subscriptions / subscription_events : owner may SELECT only —
--    all writes happen through the RPCs below or a service-role webhook.
-- ---------------------------------------------------------------------------
alter table public.subscription_plans enable row level security;
drop policy if exists "plans_select_active" on public.subscription_plans;
create policy "plans_select_active" on public.subscription_plans
  for select using (is_active);

alter table public.user_subscriptions enable row level security;
drop policy if exists "own_select" on public.user_subscriptions;
create policy "own_select" on public.user_subscriptions
  for select using (user_id = auth.uid());

alter table public.subscription_events enable row level security;
drop policy if exists "own_select" on public.subscription_events;
create policy "own_select" on public.subscription_events
  for select using (user_id = auth.uid());

-- Table-level defense in depth: even though migration 015 grants broad
-- CRUD to `authenticated` by default, explicitly take direct write access
-- away from these three tables. Only SECURITY DEFINER RPCs (owned by the
-- migration role) and the service-role webhook may write to them.
revoke insert, update, delete on public.subscription_plans from authenticated, anon;
revoke insert, update, delete on public.user_subscriptions from authenticated, anon;
revoke insert, update, delete on public.subscription_events from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. Seed Free + Pro (idempotent — safe to re-run this migration).
-- ---------------------------------------------------------------------------
insert into public.subscription_plans (name, slug, description, price_monthly, price_yearly, sort_order, features, limits)
values
  (
    'Free', 'free', 'Everything you need to start tracking your money.',
    0, 0, 0,
    jsonb_build_object(
      'advanced_analytics', false,
      'advanced_reports', false,
      'pdf_reports', false,
      'csv_export', false,
      'financial_insights', false
    ),
    jsonb_build_object(
      'accounts', 3,
      'transactions_per_month', 500,
      'budgets', 3,
      'bills', 5,
      'lending_records', 5
    )
  ),
  (
    'Pro', 'pro', 'Unlimited tracking with advanced insights and exports.',
    199, 1999, 1,
    jsonb_build_object(
      'advanced_analytics', true,
      'advanced_reports', true,
      'pdf_reports', true,
      'csv_export', true,
      'financial_insights', true
    ),
    jsonb_build_object(
      'accounts', -1,
      'transactions_per_month', -1,
      'budgets', -1,
      'bills', -1,
      'lending_records', -1
    )
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  sort_order = excluded.sort_order,
  features = excluded.features,
  limits = excluded.limits,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 6. Backfill: every existing user gets a Free subscription. New users get
--    one from ensure_user_setup() below (called on SIGNED_IN, same as
--    profile + default categories). Either path is idempotent
--    (unique user_id, ON CONFLICT DO NOTHING) — never overwrites a real one.
-- ---------------------------------------------------------------------------
insert into public.user_subscriptions (user_id, plan_id, status)
select u.id, p.id, 'active'
from auth.users u
cross join lateral (select id from public.subscription_plans where slug = 'free' limit 1) p
where not exists (select 1 from public.user_subscriptions s where s.user_id = u.id)
on conflict (user_id) do nothing;

-- Extend the existing first-login setup (migration 011) to also provision a
-- Free subscription. Profile + category seeding behaviour is unchanged.
create or replace function public.ensure_user_setup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (auth.uid(), auth.jwt() ->> 'email')
    on conflict (id) do nothing;
  if not exists (select 1 from public.categories where user_id = auth.uid()) then
    perform public.seed_user_defaults(auth.uid());
  end if;
  insert into public.user_subscriptions (user_id, plan_id, status)
    select auth.uid(), id, 'active' from public.subscription_plans where slug = 'free'
    on conflict (user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. get_my_subscription(): the single read path for the whole app. Self-
--    heals — if a user somehow has no row yet, it provisions Free on the
--    spot instead of ever resolving to "no plan".
-- ---------------------------------------------------------------------------
create or replace function public.get_my_subscription()
returns table (
  subscription_id uuid,
  plan_id uuid,
  plan_slug text,
  plan_name text,
  price_monthly numeric,
  price_yearly numeric,
  currency text,
  features jsonb,
  limits jsonb,
  status text,
  billing_cycle text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  trial_start timestamptz,
  trial_end timestamptz,
  cancelled_at timestamptz,
  provider text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.user_subscriptions;
  v_free uuid;
begin
  select * into v_sub from public.user_subscriptions where user_id = auth.uid();
  if not found then
    select id into v_free from public.subscription_plans where slug = 'free';
    insert into public.user_subscriptions (user_id, plan_id, status)
      values (auth.uid(), v_free, 'active')
      on conflict (user_id) do nothing;
    select * into v_sub from public.user_subscriptions where user_id = auth.uid();
  end if;

  return query
    select v_sub.id, p.id, p.slug, p.name, p.price_monthly, p.price_yearly, p.currency,
           p.features, p.limits, v_sub.status, v_sub.billing_cycle,
           v_sub.current_period_start, v_sub.current_period_end, v_sub.cancel_at_period_end,
           v_sub.trial_start, v_sub.trial_end, v_sub.cancelled_at, v_sub.provider
    from public.subscription_plans p
    where p.id = v_sub.plan_id;
end;
$$;

grant execute on function public.get_my_subscription() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. get_subscription_usage(): actual counts vs. the caller's effective
--    limits, in one round trip. -1 in `limits` == unlimited, consistently.
-- ---------------------------------------------------------------------------
create or replace function public.get_subscription_usage()
returns table (resource text, used int, limit_value int, unlimited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits jsonb;
  v_accounts int; v_budgets int; v_bills int; v_lending int; v_tx int;
  v_l_accounts int; v_l_budgets int; v_l_bills int; v_l_lending int; v_l_tx int;
begin
  select limits into v_limits from public.get_my_subscription();

  select count(*) into v_accounts from public.accounts where user_id = auth.uid();
  select count(*) into v_budgets from public.budgets
    where user_id = auth.uid()
      and year = extract(year from current_date)::int
      and month = extract(month from current_date)::int;
  select count(*) into v_bills from public.recurring_transactions
    where user_id = auth.uid() and status = 'active';
  select count(*) into v_lending from public.lending_records
    where user_id = auth.uid() and status not in ('cancelled','written_off');
  select count(*) into v_tx from public.transactions
    where user_id = auth.uid() and source = 'manual'
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

grant execute on function public.get_subscription_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Cancel / resume. Cancellation never downgrades immediately — Pro stays
--    active until current_period_end; the (future) webhook/processor flips
--    it to 'expired' once that date passes. Users cannot set status/plan
--    themselves; these RPCs are the only door.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_subscription()
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare v_sub public.user_subscriptions;
begin
  update public.user_subscriptions
    set cancel_at_period_end = true, cancelled_at = now(), updated_at = now()
    where user_id = auth.uid() and status in ('active','trialing','past_due')
    returning * into v_sub;
  if not found then
    raise exception 'No active subscription to cancel';
  end if;

  insert into public.subscription_events (user_id, subscription_id, event_type, payload)
    values (auth.uid(), v_sub.id, 'cancel_requested', jsonb_build_object('at', now()));

  return v_sub;
end;
$$;

create or replace function public.resume_subscription()
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare v_sub public.user_subscriptions;
begin
  update public.user_subscriptions
    set cancel_at_period_end = false, cancelled_at = null, updated_at = now()
    where user_id = auth.uid() and cancel_at_period_end = true
      and status in ('active','trialing','past_due')
    returning * into v_sub;
  if not found then
    raise exception 'No pending cancellation to resume';
  end if;

  insert into public.subscription_events (user_id, subscription_id, event_type, payload)
    values (auth.uid(), v_sub.id, 'cancel_reverted', jsonb_build_object('at', now()));

  return v_sub;
end;
$$;

grant execute on function public.cancel_subscription() to authenticated;
grant execute on function public.resume_subscription() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Server-side entitlement enforcement. Frontend checks (useSubscription /
--     canCreate) are UX only — this trigger is the real gate and cannot be
--     bypassed by calling supabase-js directly from the browser.
--
--     * Only Free-plan limits ever block anything (-1 == unlimited, Pro's
--       limits are always -1, so Pro is never touched by this trigger).
--     * transactions: only source = 'manual' rows count / are gated — bill
--       payments, EMI postings and lending interest income are system-
--       generated and must never be blocked by a user's manual-entry cap.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_limit int;
  v_count int;
begin
  v_key := case tg_table_name
    when 'accounts' then 'accounts'
    when 'budgets' then 'budgets'
    when 'recurring_transactions' then 'bills'
    when 'lending_records' then 'lending_records'
    when 'transactions' then 'transactions_per_month'
    else null
  end;
  if v_key is null then
    return new;
  end if;
  if tg_table_name = 'transactions' and coalesce(new.source, 'manual') <> 'manual' then
    return new; -- system-generated postings (bills, EMI, lending interest) are never capped
  end if;

  select coalesce((p.limits->>v_key)::int, -1) into v_limit
  from public.user_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.user_id = new.user_id and s.status in ('active','trialing');

  if not found then
    -- No subscription row yet (should be rare — ensure_user_setup provisions
    -- one) — fall back to the Free plan's limits rather than allow/deny blind.
    select coalesce((limits->>v_key)::int, -1) into v_limit
    from public.subscription_plans where slug = 'free';
  end if;

  if v_limit is null or v_limit < 0 then
    return new; -- unlimited on this plan
  end if;

  if tg_table_name = 'accounts' then
    select count(*) into v_count from public.accounts where user_id = new.user_id;
  elsif tg_table_name = 'budgets' then
    select count(*) into v_count from public.budgets
      where user_id = new.user_id and year = new.year and month = new.month;
  elsif tg_table_name = 'recurring_transactions' then
    select count(*) into v_count from public.recurring_transactions
      where user_id = new.user_id and status = 'active';
  elsif tg_table_name = 'lending_records' then
    select count(*) into v_count from public.lending_records
      where user_id = new.user_id and status not in ('cancelled','written_off');
  elsif tg_table_name = 'transactions' then
    select count(*) into v_count from public.transactions
      where user_id = new.user_id and source = 'manual'
        and transaction_date >= date_trunc('month', new.transaction_date)::date
        and transaction_date < (date_trunc('month', new.transaction_date) + interval '1 month')::date;
  end if;

  if v_count >= v_limit then
    raise exception using
      message = format('PLAN_LIMIT:%s', v_key),
      detail = format('%s of %s used on the Free plan.', v_count, v_limit),
      errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_plan_limit_accounts on public.accounts;
create trigger trg_plan_limit_accounts
  before insert on public.accounts
  for each row execute function public.enforce_subscription_limit();

drop trigger if exists trg_plan_limit_budgets on public.budgets;
create trigger trg_plan_limit_budgets
  before insert on public.budgets
  for each row execute function public.enforce_subscription_limit();

drop trigger if exists trg_plan_limit_bills on public.recurring_transactions;
create trigger trg_plan_limit_bills
  before insert on public.recurring_transactions
  for each row execute function public.enforce_subscription_limit();

drop trigger if exists trg_plan_limit_lending on public.lending_records;
create trigger trg_plan_limit_lending
  before insert on public.lending_records
  for each row execute function public.enforce_subscription_limit();

drop trigger if exists trg_plan_limit_transactions on public.transactions;
create trigger trg_plan_limit_transactions
  before insert on public.transactions
  for each row execute function public.enforce_subscription_limit();

-- ---------------------------------------------------------------------------
-- 11. Realtime — so the plan badge / subscription page update live once a
--     webhook (or another device) changes the row.
-- ---------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.user_subscriptions;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
