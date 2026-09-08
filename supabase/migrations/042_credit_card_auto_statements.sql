-- 042: automatic, catch-up-capable credit card statement generation.
--
-- FIRST: fixes a real bug in 041's generate_credit_card_statement(). It
-- summed transactions with `transaction_date < p_period_end` (EXCLUSIVE).
-- But this task's whole period model is inclusive-of-the-statement-day --
-- "26 Aug -> 25 Sep" statements explicitly include the 25 Sep purchase.
-- Fixed to `<= p_period_end`. Safe to fix in place (not a new function
-- name): this feature was only built last turn and no real statements have
-- been generated against it yet in production.
--
-- SECOND: adds statement_day / due_days_after_statement / default_payment_
-- account_id as account.metadata fields (same pattern as credit_limit /
-- current_outstanding -- no new columns needed, jsonb already holds
-- per-type config). AccountForm.jsx now exposes them for a credit card.
--
-- THIRD: generate_due_credit_card_statements_all(), wired into the
-- EXISTING daily pg_cron job (moneyflow-process-recurring, 1:30 AM, calls
-- process_all_recurring()) -- no second scheduler introduced. For every
-- configured credit card (statement_day set), it does NOT just check
-- "today == statement_day" (fragile: a single missed cron run would skip
-- that card's statement forever). Instead, for each card it finds the last
-- statement already generated and walks forward one period at a time,
-- generating every completed-but-missing period up to today (capped at 24
-- per run as a safety bound against a card left unattended for years) --
-- this makes the whole thing catch-up-safe and idempotent: running it any
-- number of times, any day, produces exactly the periods that should exist
-- and no more. A card with no statement history yet only gets the single
-- most-recently-completed period, not an unbounded historical backfill --
-- there is no reliable signal for how far back to go before this feature
-- existed. Manual generation (GenerateStatementForm.jsx) and automatic
-- generation now share the exact same underlying insert logic
-- (_generate_credit_card_statement), never two competing implementations.

-- ---------------------------------------------------------------------------
-- 1. Fix the inclusive/exclusive boundary bug.
-- ---------------------------------------------------------------------------
create or replace function public.generate_credit_card_statement(
  p_account uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date
)
returns public.credit_card_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  acct public.accounts;
  v_total numeric(14,2);
  stmt public.credit_card_statements;
begin
  select * into acct from public.accounts
    where id = p_account and user_id = auth.uid() for update;
  if not found then raise exception 'Account not found'; end if;
  if public.account_financial_type(acct.type) <> 'liability' then
    raise exception 'Only a credit card account can have a statement';
  end if;
  if p_period_end <= p_period_start then
    raise exception 'Statement period end must be after the start';
  end if;
  if p_due_date < p_period_end then
    raise exception 'Due date cannot be before the statement period ends';
  end if;

  -- period_end is INCLUSIVE -- "26 Aug -> 25 Sep" counts the 25 Sep purchase.
  select coalesce(sum(case when type = 'expense' then amount else -amount end), 0) into v_total
  from public.transactions
  where account_id = p_account and user_id = auth.uid()
    and transaction_date >= p_period_start and transaction_date <= p_period_end;

  insert into public.credit_card_statements (
    user_id, account_id, period_start, period_end, statement_amount, due_date
  ) values (
    auth.uid(), p_account, p_period_start, p_period_end, greatest(0, v_total), p_due_date
  )
  on conflict (account_id, period_start, period_end) do nothing
  returning * into stmt;

  if stmt.id is null then
    select * into stmt from public.credit_card_statements
      where account_id = p_account and period_start = p_period_start and period_end = p_period_end;
  end if;

  return stmt;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Same insert logic, callable internally with an explicit user_id (the
--    cron path has no auth.uid()) -- manual and automatic generation now
--    share this one implementation instead of two competing ones.
-- ---------------------------------------------------------------------------
create or replace function public._generate_credit_card_statement(
  p_user uuid,
  p_account uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date
)
returns public.credit_card_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(14,2);
  stmt public.credit_card_statements;
begin
  select coalesce(sum(case when type = 'expense' then amount else -amount end), 0) into v_total
  from public.transactions
  where account_id = p_account and user_id = p_user
    and transaction_date >= p_period_start and transaction_date <= p_period_end;

  insert into public.credit_card_statements (
    user_id, account_id, period_start, period_end, statement_amount, due_date
  ) values (
    p_user, p_account, p_period_start, p_period_end, greatest(0, v_total), p_due_date
  )
  on conflict (account_id, period_start, period_end) do nothing
  returning * into stmt;

  if stmt.id is null then
    select * into stmt from public.credit_card_statements
      where account_id = p_account and period_start = p_period_start and period_end = p_period_end;
  end if;

  return stmt;
end;
$$;

revoke execute on function public._generate_credit_card_statement(uuid, uuid, date, date, date)
  from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 3. Deterministic statement-day -> date, clamped to the month's last valid
--    day (statement_day 29/30/31 in February, etc.) -- same clamping idiom
--    already used by recurring_first_due() for monthly/yearly bills.
-- ---------------------------------------------------------------------------
create or replace function public.credit_card_statement_date(p_year int, p_month int, p_day int)
returns date
language sql
immutable
as $$
  select least(
    make_date(p_year, p_month, 1) + (greatest(1, p_day) - 1),
    (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Catch-up generator for one card.
-- ---------------------------------------------------------------------------
create or replace function public.generate_due_credit_card_statements_for_account(p_account uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acct public.accounts;
  v_statement_day int;
  v_due_days int;
  last_stmt public.credit_card_statements;
  today date := current_date;
  walk_anchor date;
  this_end date;
  prev_anchor date;
  prev_end date;
  period_start date;
  due_date date;
  steps int := 0;
  max_steps constant int := 24;
begin
  select * into acct from public.accounts where id = p_account;
  if not found or not acct.is_active then return; end if;
  if public.account_financial_type(acct.type) <> 'liability' then return; end if;

  v_statement_day := nullif(acct.metadata->>'statement_day', '')::int;
  if v_statement_day is null or v_statement_day < 1 or v_statement_day > 31 then
    return; -- not configured for automatic statements; manual generation still works
  end if;
  v_due_days := coalesce(nullif(acct.metadata->>'due_days_after_statement', '')::int, 15);

  select * into last_stmt from public.credit_card_statements
    where account_id = p_account order by period_end desc limit 1;

  if last_stmt.id is null then
    -- First-ever statement: only the most recently completed period, never
    -- an unbounded backfill of the card's whole history.
    walk_anchor := date_trunc('month', today)::date;
    this_end := public.credit_card_statement_date(
      extract(year from walk_anchor)::int, extract(month from walk_anchor)::int, v_statement_day);
    if this_end > today then
      walk_anchor := (walk_anchor - interval '1 month')::date;
      this_end := public.credit_card_statement_date(
        extract(year from walk_anchor)::int, extract(month from walk_anchor)::int, v_statement_day);
    end if;
    prev_anchor := (walk_anchor - interval '1 month')::date;
    prev_end := public.credit_card_statement_date(
      extract(year from prev_anchor)::int, extract(month from prev_anchor)::int, v_statement_day);
    period_start := prev_end + 1;
    due_date := this_end + v_due_days;
    perform public._generate_credit_card_statement(acct.user_id, p_account, period_start, this_end, due_date);
    return;
  end if;

  -- Catch-up: one period at a time, right after the last statement already
  -- on record, up through the most recently completed period <= today.
  walk_anchor := date_trunc('month', last_stmt.period_end + interval '1 month')::date;
  loop
    exit when steps >= max_steps;
    this_end := public.credit_card_statement_date(
      extract(year from walk_anchor)::int, extract(month from walk_anchor)::int, v_statement_day);
    exit when this_end > today;
    period_start := last_stmt.period_end + 1;
    due_date := this_end + v_due_days;
    perform public._generate_credit_card_statement(acct.user_id, p_account, period_start, this_end, due_date);
    last_stmt.period_end := this_end;
    walk_anchor := (walk_anchor + interval '1 month')::date;
    steps := steps + 1;
  end loop;
end;
$$;

revoke execute on function public.generate_due_credit_card_statements_for_account(uuid)
  from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 5. Driver over every configured credit card, every user. One card's
--    failure never blocks the rest (sec. 39) -- logged via RAISE WARNING,
--    not swallowed silently, and never re-raised to abort the whole run.
-- ---------------------------------------------------------------------------
create or replace function public.generate_due_credit_card_statements_all()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.accounts
    where is_active
      and public.account_financial_type(type) = 'liability'
      and coalesce(metadata->>'statement_day', '') <> ''
  loop
    begin
      perform public.generate_due_credit_card_statements_for_account(r.id);
    exception when others then
      raise warning 'generate_due_credit_card_statements_for_account(%) failed: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

revoke execute on function public.generate_due_credit_card_statements_all() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 6. Ride the EXISTING daily cron job (see migration ~023's "14. Daily
--    scheduled processor via pg_cron", moneyflow-process-recurring,
--    1:30 AM) -- no second scheduler.
-- ---------------------------------------------------------------------------
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
end;
$$;
