-- 044: show an EMI's FULL payment amount in Transactions (not just its
--      interest slice), while keeping expense reporting correct.
--
-- BEFORE: _record_liability_payment() split an EMI installment into two
-- separate, disconnected effects:
--   1. An interest-only transaction row (account_id = null) -- amount =
--      interest, e.g. Rs.1,921. This is the ONLY thing that ever showed up
--      in Transactions/Reports for an EMI payment.
--   2. A manual, invisible cash/card leg for the FULL amount (Rs.6,765) --
--      current_balance debited directly (or a credit card's outstanding
--      increased), with no transaction row at all.
-- So the Transactions page misleadingly showed Rs.1,921 for a payment that
-- actually moved Rs.6,765 -- exactly the problem being fixed here.
--
-- AFTER: ONE transaction row represents the whole payment --
--   amount            = the full Rs.6,765 (what actually left the account)
--   expense_amount     = just the interest, Rs.1,921 (what should count
--                        toward expense totals)
--   account_id         = the real payment account (or the credit card)
-- account_id is now real, so the EXISTING apply_transaction_balance /
-- apply_credit_card_outstanding triggers (which already fire on every
-- transactions insert) apply the correct account effect automatically --
-- exactly the same mechanism _record_bill_payment() already uses for a
-- plain bill. The manual cash/card branching that used to live inside
-- _record_liability_payment is deleted entirely; it's now redundant.
--
-- expense_amount is a new, NULLABLE column. Every existing transaction
-- (this EMI model included, and every other transaction in the app) has it
-- NULL, and every expense-summing query below falls back to
-- coalesce(expense_amount, amount) -- so nothing about any non-EMI
-- transaction's behaviour changes even slightly. Historical EMI payments
-- (recorded before this migration, interest-only with account_id = null)
-- are left exactly as they are -- not rewritten -- and their principal
-- portion continues to be tracked the same way it already was: via
-- recurring_payment_occurrences.principal_amount, which the Cash Flow
-- widget (useDashboard.js) already reads directly, unaffected by this
-- migration at all.

alter table public.transactions
  add column if not exists expense_amount numeric(14,2);
alter table public.transactions
  add constraint transactions_expense_amount_check
  check (expense_amount is null or (expense_amount >= 0 and expense_amount <= amount));

comment on column public.transactions.expense_amount is
  'Portion of `amount` that should count as an expense in reports (Dashboard/Reports/Analytics/Budgets). NULL means "the whole amount" (the default for every ordinary transaction) -- set to a smaller value only for a combined cash-movement + partial-expense transaction, e.g. an EMI payment where only the interest slice is a real expense.';

-- ---------------------------------------------------------------------------
-- 1. The one real code change: insert ONE transaction for the FULL payment.
-- ---------------------------------------------------------------------------
create or replace function public._record_liability_payment(
  p_user uuid, p_occurrence uuid, p_amount numeric, p_principal numeric, p_interest numeric,
  p_date date, p_account_id uuid, p_category_id uuid, p_payment_method_id uuid,
  p_notes text, p_client_token uuid
)
returns public.recurring_payment_occurrences
language plpgsql
security definer
set search_path = public
as $$
declare
  occ public.recurring_payment_occurrences;
  rec public.recurring_transactions;
  lia public.liabilities;
  interest_cat uuid;
  txn_id uuid;
begin
  select * into occ from public.recurring_payment_occurrences
    where id = p_occurrence and user_id = p_user for update;
  if not found then raise exception 'Payment not found'; end if;
  if occ.status = 'paid' then return occ; end if;
  if occ.status = 'cancelled' then raise exception 'This installment was cancelled'; end if;

  if p_principal < 0 or p_interest < 0 then raise exception 'Amounts cannot be negative'; end if;
  if round(p_principal + p_interest, 2) <> round(p_amount, 2) then
    raise exception 'Principal + interest must equal the payment amount';
  end if;

  select * into rec from public.recurring_transactions where id = occ.recurring_transaction_id;
  select * into lia from public.liabilities where id = occ.liability_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if p_principal > lia.outstanding_principal + 0.01 then
    raise exception 'Principal payment exceeds the outstanding loan balance';
  end if;

  select coalesce(p_category_id, (
    select id from public.categories
    where user_id = p_user and type = 'expense' and name = 'Loan Interest' limit 1
  )) into interest_cat;

  -- ONE transaction for the whole cash/card movement. account_id is the
  -- real payment account (or credit card) -- apply_transaction_balance /
  -- apply_credit_card_outstanding (both already fire on every transactions
  -- insert) apply the correct effect automatically, exactly like a plain
  -- bill already works. expense_amount = interest only, so reports never
  -- count the principal portion as an expense.
  insert into public.transactions (
    user_id, account_id, category_id, payment_method_id, type, amount, expense_amount,
    description, transaction_date, source
  ) values (
    p_user, p_account_id, interest_cat, coalesce(p_payment_method_id, rec.payment_method_id),
    'expense', p_amount, p_interest,
    coalesce(lia.name, rec.name) || ' — EMI payment', p_date, 'loan_emi_payment'
  ) returning id into txn_id;

  -- liability leg: principal reduces the loan; interest is only tracked.
  update public.liabilities set
    outstanding_principal = greatest(0, outstanding_principal - p_principal),
    principal_paid = principal_paid + p_principal,
    interest_paid = interest_paid + p_interest,
    installments_paid = installments_paid + 1,
    status = case when outstanding_principal - p_principal <= 0.005 then 'closed' else status end,
    updated_at = now()
  where id = lia.id;

  update public.recurring_payment_occurrences set
    status = 'paid', paid_amount = p_amount,
    principal_amount = p_principal, interest_amount = p_interest, paid_at = p_date,
    transaction_id = txn_id, account_id = p_account_id, autopay_failed = false, updated_at = now()
  where id = occ.id
  returning * into occ;

  update public.recurring_transactions set
    last_processed_date = current_date,
    status = case when (select outstanding_principal from public.liabilities where id = lia.id) <= 0.005
                  then 'ended' else status end,
    updated_at = now()
  where id = rec.id;

  perform public.generate_recurring_occurrences(rec.id, null);

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (p_user, 'payment_recorded',
          coalesce(lia.name, rec.name) || ' EMI recorded',
          to_char(p_amount, 'FM999999990D00'), 'success', occ.id);

  return occ;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. delete_recurring_payment()'s hard-delete path (037): its EMI-specific
--    manual restore loop was needed because the OLD model's linked
--    transaction (interest-only, account_id = null) had zero balance
--    effect on its own -- deleting it reversed nothing, so the loop had to
--    manually undo the full paid_amount. Now that a NEW-model payment's
--    transaction carries the REAL account_id and the FULL amount, deleting
--    it already correctly reverses everything via the existing triggers --
--    doing the manual restore AS WELL would double-reverse it.
--
--    Branch per occurrence: if its linked transaction has a real
--    account_id, it's a 044+ payment -- skip the manual restore, the
--    transaction delete below handles it. If the linked transaction has no
--    account_id (or there isn't one), it's a pre-044 payment -- restore
--    manually here, exactly like the pre-044 logic did.
-- ---------------------------------------------------------------------------
create or replace function public.delete_recurring_payment(p_recurring uuid, p_hard boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.recurring_transactions;
  o record;
  pay_acct public.accounts;
begin
  select * into rec from public.recurring_transactions
    where id = p_recurring and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'Recurring payment not found';
  end if;

  -- Always clear stale actionable alerts for this payment's occurrences.
  delete from public.alerts
    where user_id = auth.uid()
      and type in ('bill_due', 'bill_overdue', 'payment_failed')
      and related_id in (
        select id from public.recurring_payment_occurrences
        where recurring_transaction_id = p_recurring
      );

  if not p_hard then
    -- Soft path: end it, keep every recorded payment + transaction as-is.
    update public.recurring_payment_occurrences
      set status = 'cancelled', updated_at = now()
      where recurring_transaction_id = p_recurring and status <> 'paid';
    update public.recurring_transactions
      set status = 'ended', is_active = false, updated_at = now()
      where id = p_recurring;
    return;
  end if;

  -- Hard path, EMI: reverse only pre-044 paid occurrences manually (their
  -- linked transaction, if any, never carried a real account_id). A 044+
  -- occurrence's transaction IS the real cash/card movement -- deleting it
  -- below already reverses it via the existing triggers.
  if rec.kind = 'emi' then
    for o in
      select o.account_id, o.paid_amount, t.account_id as txn_account_id
      from public.recurring_payment_occurrences o
      left join public.transactions t on t.id = o.transaction_id
      where o.recurring_transaction_id = p_recurring and o.status = 'paid' and o.account_id is not null
    loop
      if o.txn_account_id is null then
        select * into pay_acct from public.accounts where id = o.account_id;
        if found and public.is_available_cash_account(pay_acct.type) then
          update public.accounts set current_balance = current_balance + o.paid_amount, updated_at = now()
            where id = o.account_id;
        elsif found and public.account_financial_type(pay_acct.type) = 'liability' then
          update public.accounts set metadata = jsonb_set(
              metadata, '{current_outstanding}',
              to_jsonb(greatest(0, coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0) - o.paid_amount)),
              true
            ), updated_at = now()
            where id = o.account_id;
        end if;
      end if;
    end loop;
  end if;

  -- Hard path, plain bill: unchanged from 037 -- its transaction already
  -- always carried the real account_id, so this always correctly reversed
  -- it via apply_transaction_balance.
  delete from public.transactions
    where id in (
      select transaction_id from public.recurring_payment_occurrences
      where recurring_transaction_id = p_recurring and transaction_id is not null
    );

  -- Deleting the liability cascades: liabilities -> recurring_transactions
  -- -> recurring_payment_occurrences. Otherwise delete the definition
  -- directly, which cascades its occurrences the same way.
  if rec.liability_id is not null then
    delete from public.liabilities where id = rec.liability_id and user_id = auth.uid();
  else
    delete from public.recurring_transactions where id = p_recurring and user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.delete_recurring_payment(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Every expense-summing query, fixed to fall back correctly:
--    coalesce(expense_amount, amount) instead of amount. NULL on every
--    existing/ordinary transaction means this is a no-op for everything
--    except the new EMI payment transactions.
--
--    DROP first: CREATE OR REPLACE cannot change a function's OUT-parameter
--    row shape, only its body -- Postgres requires an explicit DROP even
--    though this returns the exact same columns as before, because the
--    live database's currently-deployed version of this function may not
--    byte-for-byte match this migration file's history (it was already
--    replaced at least once this same way, see the "drop function" already
--    further up this project's own migration history for this exact
--    function).
-- ---------------------------------------------------------------------------
drop function if exists public.get_monthly_financial_summary(int, int);
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
      coalesce(sum(coalesce(expense_amount, amount)) filter (where type = 'expense'), 0) as expenses
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

drop function if exists public.get_category_expense_summary(date, date);
create or replace function public.get_category_expense_summary(p_from date, p_to date)
returns table (category_id uuid, category_name text, color text, total numeric)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.color, coalesce(sum(coalesce(t.expense_amount, t.amount)), 0) as total
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid() and t.type = 'expense'
    and t.transaction_date >= p_from and t.transaction_date <= p_to
  group by c.id, c.name, c.color
  order by total desc;
$$;

grant execute on function public.get_category_expense_summary(date,date) to authenticated;
