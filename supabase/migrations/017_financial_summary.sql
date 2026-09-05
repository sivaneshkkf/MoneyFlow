-- 017_financial_summary.sql
-- Single source of truth for point-in-time financial position.
-- Cleanly separates: available cash · credit-card debt · receivables · net worth.

-- ---------------------------------------------------------------------------
-- Account financial classification (one definition, used everywhere).
-- ---------------------------------------------------------------------------
create or replace function public.account_financial_type(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'Cash' then 'cash_asset'
    when 'Bank Account' then 'bank_asset'
    when 'UPI Wallet' then 'wallet_asset'
    when 'Digital Wallet' then 'wallet_asset'
    when 'Debit Card' then 'cash_asset'
    when 'Credit Card' then 'liability'
    else 'other_asset'
  end;
$$;

-- Whether an account contributes to "available balance" (all assets, not the
-- credit-card liability).
create or replace function public.is_available_cash_account(p_type text)
returns boolean
language sql
immutable
as $$
  select public.account_financial_type(p_type) <> 'liability';
$$;

-- ---------------------------------------------------------------------------
-- Guard: a transaction linked to a Credit Card account must NOT move
-- current_balance (credit cards are tracked via metadata debt, not cash logic).
-- ---------------------------------------------------------------------------
create or replace function public.apply_transaction_balance()
returns trigger
language plpgsql
as $$
declare
  old_ok boolean := false;
  new_ok boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.account_id is not null then
    select public.is_available_cash_account(type) into old_ok from public.accounts where id = old.account_id;
  end if;
  if tg_op in ('UPDATE', 'INSERT') and new.account_id is not null then
    select public.is_available_cash_account(type) into new_ok from public.accounts where id = new.account_id;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new_ok, false) then
      update public.accounts
        set current_balance = current_balance + case when new.type = 'income' then new.amount else -new.amount end,
            updated_at = now()
        where id = new.account_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if coalesce(old_ok, false) then
      update public.accounts
        set current_balance = current_balance + case when old.type = 'income' then -old.amount else old.amount end,
            updated_at = now()
        where id = old.account_id;
    end if;
    return old;
  else
    if coalesce(old_ok, false) then
      update public.accounts
        set current_balance = current_balance + case when old.type = 'income' then -old.amount else old.amount end,
            updated_at = now()
        where id = old.account_id;
    end if;
    if coalesce(new_ok, false) then
      update public.accounts
        set current_balance = current_balance + case when new.type = 'income' then new.amount else -new.amount end,
            updated_at = now()
        where id = new.account_id;
    end if;
    return new;
  end if;
end;
$$;

-- recalculate_account_balance: skip lending/tx cash logic for credit cards.
create or replace function public.recalculate_account_balance(p_account_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  acct public.accounts;
  tx_delta numeric(14,2);
  lent_delta numeric(14,2);
  repaid_delta numeric(14,2);
  result numeric(14,2);
begin
  select * into acct from public.accounts
    where id = p_account_id and user_id = auth.uid();
  if not found then raise exception 'Account not found'; end if;

  -- Credit cards are not cash accounts: leave current_balance at its opening value.
  if not public.is_available_cash_account(acct.type) then
    update public.accounts set current_balance = acct.opening_balance, updated_at = now()
      where id = p_account_id;
    return acct.opening_balance;
  end if;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into tx_delta from public.transactions
    where account_id = p_account_id and user_id = auth.uid();

  select coalesce(sum(principal_amount), 0) into lent_delta
    from public.lending_records where account_id = p_account_id and user_id = auth.uid();

  select coalesce(sum(amount), 0) into repaid_delta
    from public.lending_repayments where account_id = p_account_id and user_id = auth.uid();

  result := acct.opening_balance + tx_delta - lent_delta + repaid_delta;
  update public.accounts set current_balance = result, updated_at = now()
    where id = p_account_id;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_financial_summary: the one function the Dashboard AND Accounts page use.
-- ---------------------------------------------------------------------------
create or replace function public.get_financial_summary()
returns table (
  available_balance numeric,
  bank_balance numeric,
  cash_balance numeric,
  wallet_balance numeric,
  other_asset_balance numeric,
  credit_card_debt numeric,
  credit_limit numeric,
  available_credit numeric,
  credit_utilization numeric,
  money_lent numeric,
  receivable_outstanding numeric,
  principal_received numeric,
  interest_received numeric,
  overdue_amount numeric,
  borrower_count int,
  net_worth numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with acct as (
    select
      public.account_financial_type(type) as fin_type,
      current_balance,
      coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0) as outstanding,
      coalesce(nullif(metadata->>'credit_limit','')::numeric, 0) as climit
    from public.accounts
    where user_id = auth.uid() and is_active
  ),
  a as (
    select
      coalesce(sum(current_balance) filter (where fin_type <> 'liability'), 0) as available_balance,
      coalesce(sum(current_balance) filter (where fin_type = 'bank_asset'), 0) as bank_balance,
      coalesce(sum(current_balance) filter (where fin_type = 'cash_asset'), 0) as cash_balance,
      coalesce(sum(current_balance) filter (where fin_type = 'wallet_asset'), 0) as wallet_balance,
      coalesce(sum(current_balance) filter (where fin_type = 'other_asset'), 0) as other_asset_balance,
      coalesce(sum(outstanding) filter (where fin_type = 'liability'), 0) as credit_card_debt,
      coalesce(sum(climit) filter (where fin_type = 'liability'), 0) as credit_limit
    from acct
  ),
  l as (
    select
      coalesce(sum(principal_amount), 0) as money_lent,
      coalesce(sum(outstanding_principal + outstanding_interest), 0) as receivable_outstanding,
      coalesce(sum(principal_received), 0) as principal_received,
      coalesce(sum(interest_received), 0) as interest_received,
      coalesce(sum(outstanding_principal + outstanding_interest) filter (where status = 'overdue'), 0) as overdue_amount,
      count(distinct borrower_name)::int as borrower_count
    from public.lending_records
    where user_id = auth.uid() and status not in ('cancelled','written_off')
  )
  select
    a.available_balance,
    a.bank_balance,
    a.cash_balance,
    a.wallet_balance,
    a.other_asset_balance,
    a.credit_card_debt,
    a.credit_limit,
    greatest(0, a.credit_limit - a.credit_card_debt) as available_credit,
    case when a.credit_limit > 0
      then round((a.credit_card_debt / a.credit_limit) * 100, 1) else 0 end as credit_utilization,
    l.money_lent,
    l.receivable_outstanding,
    l.principal_received,
    l.interest_received,
    l.overdue_amount,
    l.borrower_count,
    (a.available_balance + l.receivable_outstanding - a.credit_card_debt) as net_worth
  from a, l;
$$;

grant execute on function public.get_financial_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Fix get_monthly_financial_summary: lending interest is already counted in
-- `income` (it is a real income transaction), so cash_flow must NOT add
-- interest_received again. Only principal_received is a cash inflow not already
-- represented as a transaction.
-- ---------------------------------------------------------------------------
create or replace function public.get_monthly_financial_summary(p_year int, p_month int)
returns table (
  income numeric,
  expenses numeric,
  money_lent numeric,
  principal_received numeric,
  interest_received numeric,
  net_operating_savings numeric,
  cash_flow numeric,
  savings_rate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with period as (
    select make_date(p_year, p_month, 1) as start_date,
           (make_date(p_year, p_month, 1) + interval '1 month')::date as end_date
  ),
  tx as (
    select
      coalesce(sum(amount) filter (where type = 'income'), 0) as income,
      coalesce(sum(amount) filter (where type = 'expense'), 0) as expenses
    from public.transactions, period
    where user_id = auth.uid()
      and transaction_date >= period.start_date
      and transaction_date < period.end_date
  ),
  lent as (
    select coalesce(sum(principal_amount), 0) as money_lent
    from public.lending_records, period
    where user_id = auth.uid()
      and lending_date >= period.start_date
      and lending_date < period.end_date
  ),
  repaid as (
    select
      coalesce(sum(principal_amount), 0) as principal_received,
      coalesce(sum(interest_amount), 0) as interest_received
    from public.lending_repayments, period
    where user_id = auth.uid()
      and payment_date >= period.start_date
      and payment_date < period.end_date
  )
  select
    tx.income,
    tx.expenses,
    lent.money_lent,
    repaid.principal_received,
    repaid.interest_received,
    (tx.income - tx.expenses) as net_operating_savings,
    (tx.income - tx.expenses - lent.money_lent + repaid.principal_received) as cash_flow,
    case when tx.income > 0 then round(((tx.income - tx.expenses) / tx.income) * 100, 1) else 0 end as savings_rate
  from tx, lent, repaid;
$$;

grant execute on function public.get_monthly_financial_summary(int,int) to authenticated;
grant execute on function public.account_financial_type(text) to authenticated, anon;
grant execute on function public.is_available_cash_account(text) to authenticated, anon;

-- Keep the legacy view financially honest (available balance, not asset+liability mix).
-- Dropped first because create-or-replace cannot rename an existing view column.
drop view if exists public.account_balance_summary;
create view public.account_balance_summary as
  select
    user_id,
    sum(current_balance) filter (where public.is_available_cash_account(type)) as available_balance,
    count(*) as account_count
  from public.accounts
  where is_active
  group by user_id;
alter view public.account_balance_summary set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Optional idempotency for repayments: callers may pass a client token; a
-- retry with the same token returns the existing repayment instead of
-- duplicating cash + income.
-- ---------------------------------------------------------------------------
alter table public.lending_repayments
  add column if not exists client_token uuid;
create unique index if not exists uq_lending_repayments_client_token
  on public.lending_repayments (user_id, client_token)
  where client_token is not null;

-- Replace the 9-arg version with a 10-arg version (adds p_client_token).
drop function if exists public.record_lending_repayment(uuid,numeric,numeric,numeric,date,uuid,uuid,text,text);

create or replace function public.record_lending_repayment(
  p_lending_record_id uuid,
  p_amount numeric,
  p_principal numeric,
  p_interest numeric,
  p_payment_date date,
  p_account_id uuid default null,
  p_payment_method_id uuid default null,
  p_notes text default null,
  p_attachment_url text default null,
  p_client_token uuid default null
)
returns public.lending_repayments
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.lending_records;
  repayment public.lending_repayments;
  interest_category uuid;
begin
  -- Idempotency: a retried call with the same token is a no-op.
  if p_client_token is not null then
    select * into repayment from public.lending_repayments
      where user_id = auth.uid() and client_token = p_client_token;
    if found then
      return repayment;
    end if;
  end if;

  select * into rec from public.lending_records
    where id = p_lending_record_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'Lending record not found';
  end if;

  if p_principal < 0 or p_interest < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  if round(p_principal + p_interest, 2) <> round(p_amount, 2) then
    raise exception 'Principal + interest must equal the repayment amount';
  end if;
  if p_principal > rec.outstanding_principal + 0.001 then
    raise exception 'Principal repayment exceeds outstanding principal';
  end if;
  if p_interest > rec.outstanding_interest + 0.001 then
    raise exception 'Interest repayment exceeds outstanding interest';
  end if;

  insert into public.lending_repayments (
    lending_record_id, user_id, amount, principal_amount, interest_amount,
    payment_date, account_id, payment_method_id, notes, attachment_url, client_token
  ) values (
    p_lending_record_id, auth.uid(), p_amount, p_principal, p_interest,
    p_payment_date, p_account_id, p_payment_method_id, p_notes, p_attachment_url, p_client_token
  ) returning * into repayment;

  update public.lending_records set
    principal_received = principal_received + p_principal,
    interest_received = interest_received + p_interest
  where id = p_lending_record_id;

  -- Cash in: principal + interest both increase the receiving account balance.
  if p_account_id is not null then
    update public.accounts set current_balance = current_balance + p_amount, updated_at = now()
      where id = p_account_id and user_id = auth.uid()
        and public.is_available_cash_account(type);
  end if;

  -- Only the interest portion is income.
  if p_interest > 0 then
    select id into interest_category from public.categories
      where user_id = auth.uid() and type = 'income' and name = 'Interest' limit 1;
    insert into public.transactions (
      user_id, account_id, category_id, payment_method_id, type, amount,
      description, transaction_date, source, lending_repayment_id
    ) values (
      auth.uid(), null, interest_category, p_payment_method_id, 'income', p_interest,
      'Interest from ' || rec.borrower_name, p_payment_date, 'lending_interest', repayment.id
    );
  end if;

  return repayment;
end;
$$;

grant execute on function public.record_lending_repayment(uuid,numeric,numeric,numeric,date,uuid,uuid,text,text,uuid) to authenticated;
