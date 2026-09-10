-- 049: Push notifications (real system/mobile alerts) for bills & recurring
--      payments due, budget thresholds crossed, credit card statements due,
--      and subscription/billing events -- all delivered from the existing
--      public.alerts table, which the app already populates for most of
--      these (bill_due, bill_overdue, payment_failed, payment_recorded,
--      custom_plan_* events). This migration:
--        1. fixes a real cross-user data leak on public.alerts, found while
--           building this (see below) -- unrelated to push, fixed here
--           because this migration already touches that exact table.
--        2. adds push_subscriptions (one row per device that opted in).
--        3. adds the two alert types the app didn't generate yet (budget
--           threshold, credit card statement due).
--        4. wires actual delivery via a Supabase Edge Function, called by
--           pg_cron + pg_net every 5 minutes.

-- ---------------------------------------------------------------------------
-- Part 1: public.alerts never got RLS enabled in any prior migration.
-- Migration 015 grants broad select/insert/update/delete on every table in
-- `public` to `authenticated` by default -- RLS is what's supposed to then
-- narrow that down to "your own rows" per table, and alerts skipped that
-- step. src/features/notifications/useNotifications.js's client-side
-- select/update/delete calls all trust RLS to scope rows (none of them add
-- their own .eq('user_id', ...) filter) -- so right now, any signed-in user
-- can read, mark-read, or delete ANY other user's alerts: bill amounts,
-- budget warnings, EMI records, custom-plan offers, all of it. Fixing this
-- first, ahead of the actual push-notification work below.
-- ---------------------------------------------------------------------------
alter table public.alerts enable row level security;

drop policy if exists "own_select" on public.alerts;
create policy "own_select" on public.alerts
  for select using (user_id = auth.uid());

-- Client only ever flips is_read (see useNotifications.js's markRead/
-- markAllRead) -- the check clause stops it from ever reassigning a row to
-- someone else's user_id.
drop policy if exists "own_update" on public.alerts;
create policy "own_update" on public.alerts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own_delete" on public.alerts;
create policy "own_delete" on public.alerts
  for delete using (user_id = auth.uid());

-- Every alert is inserted by a SECURITY DEFINER function using its own
-- p_user/auth.uid(), never a client-supplied user_id -- direct client
-- INSERT was never needed and would let anyone insert an alert claiming to
-- be any other user. Same "table-level defense in depth" pattern already
-- used for subscription_plans / user_subscriptions / subscription_events.
revoke insert on public.alerts from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Part 2: push_subscriptions -- one row per browser/device a user has
-- opted into push notifications on.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own_select" on public.push_subscriptions;
create policy "own_select" on public.push_subscriptions
  for select using (user_id = auth.uid());
drop policy if exists "own_delete" on public.push_subscriptions;
create policy "own_delete" on public.push_subscriptions
  for delete using (user_id = auth.uid());
-- No direct client insert/update -- always through save_push_subscription()
-- below, which keeps the upsert-by-endpoint logic in one place and stops
-- one user from ever attaching a subscription to someone else's user_id.
revoke insert, update on public.push_subscriptions from authenticated, anon;

create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    updated_at = now();
end;
$$;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 3: two more alert-generating checks (budget threshold, credit card
-- statement due) -- the app already generates bill_due/bill_overdue/
-- payment_failed/payment_recorded/custom_plan_* alerts; these two round out
-- the requested trigger list. Same "reminded_* flag on the row" idiom
-- process_recurring_for_user() already uses for bills, so this cron can run
-- as often as it likes without re-alerting on every pass.
-- ---------------------------------------------------------------------------
alter table public.alerts add column if not exists pushed_at timestamptz;
create index if not exists idx_alerts_unpushed on public.alerts (created_at) where pushed_at is null;

alter table public.budgets
  add column if not exists reminded_80pct boolean not null default false,
  add column if not exists reminded_100pct boolean not null default false;

alter table public.credit_card_statements
  add column if not exists reminded_upcoming boolean not null default false,
  add column if not exists reminded_due boolean not null default false,
  add column if not exists reminded_overdue boolean not null default false;

create or replace function public.check_budget_alerts_for_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  v_spent numeric(14,2);
  v_pct numeric;
begin
  for b in
    select bud.*, c.name as category_name
    from public.budgets bud
    join public.categories c on c.id = bud.category_id
    where bud.user_id = p_user
      and bud.month = extract(month from current_date)::int
      and bud.year = extract(year from current_date)::int
      and not (bud.reminded_80pct and bud.reminded_100pct)
  loop
    -- Same coalesce(expense_amount, amount) convention used by every other
    -- expense-summing query in the app (044) -- an EMI's reportable slice,
    -- not its full cash movement.
    select coalesce(sum(coalesce(expense_amount, amount)), 0) into v_spent
    from public.transactions
    where user_id = p_user and category_id = b.category_id and type = 'expense'
      and extract(month from transaction_date)::int = b.month
      and extract(year from transaction_date)::int = b.year;

    v_pct := case when b.amount > 0 then (v_spent / b.amount) * 100 else 0 end;

    if v_pct >= 100 and not b.reminded_100pct then
      insert into public.alerts (user_id, type, title, body, severity, related_id)
      values (p_user, 'budget_exceeded', b.category_name || ' budget exceeded',
              to_char(v_spent, 'FM999999990D00') || ' spent of ' || to_char(b.amount, 'FM999999990D00'),
              'danger', b.id);
      update public.budgets set reminded_80pct = true, reminded_100pct = true where id = b.id;
    elsif v_pct >= 80 and not b.reminded_80pct then
      insert into public.alerts (user_id, type, title, body, severity, related_id)
      values (p_user, 'budget_threshold', b.category_name || ' budget at ' || round(v_pct) || '%',
              to_char(v_spent, 'FM999999990D00') || ' spent of ' || to_char(b.amount, 'FM999999990D00'),
              'warning', b.id);
      update public.budgets set reminded_80pct = true where id = b.id;
    end if;
  end loop;
end;
$$;
revoke execute on function public.check_budget_alerts_for_user(uuid) from anon, authenticated, public;

create or replace function public.check_credit_card_due_alerts_for_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  days_left int;
  v_due numeric(14,2);
begin
  for s in
    select cs.*, a.name as account_name
    from public.credit_card_statements cs
    join public.accounts a on a.id = cs.account_id
    where cs.user_id = p_user and cs.status <> 'paid'
      and not (cs.reminded_due and cs.reminded_overdue)
  loop
    days_left := s.due_date - current_date;
    v_due := greatest(0, s.statement_amount - s.paid_amount);
    if v_due <= 0 then
      continue;
    end if;

    if days_left < 0 and not s.reminded_overdue then
      insert into public.alerts (user_id, type, title, body, severity, related_id)
      values (p_user, 'card_overdue', s.account_name || ' bill is ' || abs(days_left) ||
              ' day' || case when abs(days_left) = 1 then '' else 's' end || ' overdue',
              to_char(v_due, 'FM999999990D00') || ' due', 'danger', s.id);
      update public.credit_card_statements set reminded_overdue = true where id = s.id;
    elsif days_left = 0 and not s.reminded_due then
      insert into public.alerts (user_id, type, title, body, severity, related_id)
      values (p_user, 'card_due', s.account_name || ' bill is due today',
              to_char(v_due, 'FM999999990D00') || ' due', 'warning', s.id);
      update public.credit_card_statements set reminded_due = true where id = s.id;
    elsif days_left between 1 and 3 and not s.reminded_upcoming then
      insert into public.alerts (user_id, type, title, body, severity, related_id)
      values (p_user, 'card_due', s.account_name || ' bill due in ' || days_left ||
              ' day' || case when days_left = 1 then '' else 's' end,
              to_char(v_due, 'FM999999990D00') || ' due', 'info', s.id);
      update public.credit_card_statements set reminded_upcoming = true where id = s.id;
    end if;
  end loop;
end;
$$;
revoke execute on function public.check_credit_card_due_alerts_for_user(uuid) from anon, authenticated, public;

-- Wire both into the SAME daily cron job bills/recurring/credit-card
-- statement generation already run through -- no second scheduler for
-- these two (same principle 041/042's statement generation was built on).
create or replace function public.process_all_recurring()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare u uuid;
begin
  for u in select distinct user_id from public.recurring_transactions where status = 'active'
  loop
    perform public.process_recurring_for_user(u);
  end loop;
  perform public.generate_due_credit_card_statements_all();

  for u in select distinct user_id from public.budgets
  loop
    perform public.check_budget_alerts_for_user(u);
  end loop;
  for u in select distinct user_id from public.credit_card_statements where status <> 'paid'
  loop
    perform public.check_credit_card_due_alerts_for_user(u);
  end loop;
end;
$$;

-- Three RPCs the send-push-notifications Edge Function uses (via the
-- classic SUPABASE_SERVICE_ROLE_KEY, which Edge Functions get injected
-- automatically -- unlike the newer-format "Secret key" the project found
-- does NOT carry elevated PostgREST privileges here, see
-- subscription-webhook/index.ts's header comment, the classic service_role
-- JWT does). Granted explicitly to service_role so this never depends on
-- ambient/inherited privileges.
create or replace function public._push_delivery_queue(p_limit int default 200)
returns table (
  alert_id uuid, user_id uuid, type text, title text, body text, severity text, related_id uuid,
  subscription_id uuid, endpoint text, p256dh text, auth text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.user_id, a.type, a.title, a.body, a.severity, a.related_id,
         ps.id, ps.endpoint, ps.p256dh, ps.auth
  from (
    select * from public.alerts where pushed_at is null order by created_at limit p_limit
  ) a
  left join public.push_subscriptions ps on ps.user_id = a.user_id;
$$;
revoke execute on function public._push_delivery_queue(int) from anon, authenticated, public;
grant execute on function public._push_delivery_queue(int) to service_role;

create or replace function public._mark_alerts_pushed(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.alerts set pushed_at = now() where id = any(p_ids);
$$;
revoke execute on function public._mark_alerts_pushed(uuid[]) from anon, authenticated, public;
grant execute on function public._mark_alerts_pushed(uuid[]) to service_role;

-- The push service itself tells us when a subscription is dead (404/410) --
-- no user_id check needed since the caller is only ever acting on the
-- literal endpoint that specific response was for.
create or replace function public._purge_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
revoke execute on function public._purge_push_subscription(text) from anon, authenticated, public;
grant execute on function public._purge_push_subscription(text) to service_role;

-- ---------------------------------------------------------------------------
-- Part 4: actual delivery -- a Supabase Edge Function
-- (supabase/functions/send-push-notifications) sends the real Web Push HTTP
-- requests, since Postgres itself can't sign/send those. pg_net is what
-- lets a scheduled Postgres job call that Edge Function.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not enabled automatically (%). Enable it in the Supabase dashboard (Database -> Extensions), then this migration''s cron.schedule call below will work.', sqlerrm;
end $$;

-- Locked-down config store -- zero grants to anon/authenticated, only
-- readable by the SECURITY DEFINER function below. You MUST fill in both
-- values after deploying the Edge Function (see the setup checklist that
-- comes with this migration) -- until then trigger_send_push_notifications()
-- is a safe no-op, so this migration is fine to run before that's done.
create table if not exists public.app_config (
  key text primary key,
  value text
);
revoke all on public.app_config from authenticated, anon;

insert into public.app_config (key, value) values
  ('push_function_url', null),
  ('push_cron_secret', null)
on conflict (key) do nothing;

create or replace function public.trigger_send_push_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.app_config where key = 'push_function_url';
  select value into v_secret from public.app_config where key = 'push_cron_secret';
  if v_url is null or v_secret is null then
    return; -- not configured yet -- silent no-op, never fails the cron run
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke execute on function public.trigger_send_push_notifications() from anon, authenticated, public;

-- Runs every 5 minutes -- independent of the once-a-day cron above, since a
-- push should go out promptly rather than wait for tomorrow's run. Same
-- defensive wrapper already used for moneyflow-process-recurring, so a
-- pg_cron/pg_net that isn't enabled yet doesn't fail this migration.
do $$
begin
  perform cron.unschedule('moneyflow-send-push-notifications');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('moneyflow-send-push-notifications', '*/5 * * * *',
    $cron$ select public.trigger_send_push_notifications(); $cron$);
exception when others then
  raise notice 'Could not schedule cron job (%). After enabling pg_cron, run: select cron.schedule(''moneyflow-send-push-notifications'', ''*/5 * * * *'', ''select public.trigger_send_push_notifications();'');', sqlerrm;
end $$;
