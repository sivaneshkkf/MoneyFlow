-- 010_create_functions.sql
-- Monthly financial summary keeping each concept separate (see spec §93/§94).
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
    (tx.income - tx.expenses - lent.money_lent + repaid.principal_received + repaid.interest_received) as cash_flow,
    case when tx.income > 0 then round(((tx.income - tx.expenses) / tx.income) * 100, 1) else 0 end as savings_rate
  from tx, lent, repaid;
$$;

-- Lending portfolio summary.
create or replace function public.get_lending_summary()
returns table (
  total_lent numeric,
  outstanding numeric,
  received numeric,
  interest_earned numeric,
  overdue numeric,
  borrower_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(principal_amount), 0),
    coalesce(sum(outstanding_principal + outstanding_interest), 0),
    coalesce(sum(principal_received + interest_received), 0),
    coalesce(sum(interest_received), 0),
    coalesce(sum(outstanding_principal + outstanding_interest) filter (where status = 'overdue'), 0),
    count(distinct borrower_name)::int
  from public.lending_records
  where user_id = auth.uid() and status not in ('cancelled','written_off');
$$;

-- Category expense breakdown for a date range.
create or replace function public.get_category_expense_summary(p_from date, p_to date)
returns table (category_id uuid, category_name text, color text, total numeric)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.color, coalesce(sum(t.amount), 0) as total
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid() and t.type = 'expense'
    and t.transaction_date >= p_from and t.transaction_date <= p_to
  group by c.id, c.name, c.color
  order by total desc;
$$;

-- Recompute an account balance from scratch (repair helper).
create or replace function public.recalculate_account_balance(p_account_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  base numeric(14,2);
  tx_delta numeric(14,2);
  lent_delta numeric(14,2);
  repaid_delta numeric(14,2);
  result numeric(14,2);
begin
  select opening_balance into base from public.accounts
    where id = p_account_id and user_id = auth.uid();
  if not found then raise exception 'Account not found'; end if;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into tx_delta from public.transactions
    where account_id = p_account_id and user_id = auth.uid();

  select coalesce(sum(principal_amount), 0) into lent_delta
    from public.lending_records where account_id = p_account_id and user_id = auth.uid();

  select coalesce(sum(amount), 0) into repaid_delta
    from public.lending_repayments where account_id = p_account_id and user_id = auth.uid();

  result := base + tx_delta - lent_delta + repaid_delta;
  update public.accounts set current_balance = result, updated_at = now()
    where id = p_account_id;
  return result;
end;
$$;

-- Views
create or replace view public.borrower_summary as
  select
    user_id,
    borrower_name,
    count(*) as record_count,
    sum(principal_amount) as total_lent,
    sum(principal_received + interest_received) as total_received,
    sum(outstanding_principal + outstanding_interest) as outstanding,
    min(due_date) filter (where outstanding_principal + outstanding_interest > 0) as next_due_date
  from public.lending_records
  group by user_id, borrower_name;

create or replace view public.account_balance_summary as
  select user_id, sum(current_balance) as total_balance, count(*) as account_count
  from public.accounts where is_active group by user_id;
