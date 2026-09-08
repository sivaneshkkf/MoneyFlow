-- 032: fix enforce_subscription_limit() blowing up on lending_records (and
--      any other non-`transactions` table it's attached to) with:
--        record "new" has no field "source"
--
-- Root cause: `enforce_subscription_limit()` is one shared trigger function
-- attached to accounts, budgets, recurring_transactions, lending_records and
-- transactions. NEW is therefore a generic `record`, not a fixed row type.
-- The old code combined the table-name guard and the `source` field access
-- into a single boolean expression:
--
--   if tg_table_name = 'transactions' and coalesce(new.source, 'manual') <> 'manual' then
--
-- PL/pgSQL does not reliably short-circuit a generic record's field access
-- inside a combined AND like this, so on every OTHER table (lending_records
-- included, which has no `source` column at all) it still tried to resolve
-- `new.source` and raised "record \"new\" has no field \"source\"" on every
-- insert. Splitting the table-name check into its own outer `if` guarantees
-- `new.source` is never touched unless the row actually is a transactions row.
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

  if tg_table_name = 'transactions' then
    if coalesce(new.source, 'manual') <> 'manual' then
      return new; -- system-generated postings (bills, EMI, lending interest) are never capped
    end if;
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
