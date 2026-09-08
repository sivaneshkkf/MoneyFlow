-- 037: let deleting a bill/EMI with payment history ask "archive it (keep
--      the paid history) or delete everything, including the paid
--      amounts?" instead of always silently archiving.
--
-- This requires actually knowing, per paid installment, whether it moved
-- real cash and from which account — which nothing currently records. An
-- EMI's cash leg (_record_liability_payment) is a direct account debit with
-- NO transactions row at all (only the interest portion gets one, and that
-- one is deliberately account_id = null). So there was no reliable way to
-- reverse "the real payments only" on a full purge -- which is exactly the
-- confusion this session just spent several manual, error-prone SQL
-- corrections working around for a test EMI record.
--
-- Fix: record which account (if any) a paid occurrence's cash actually left
-- from, at the moment it's recorded. Null means no cash ever moved for that
-- installment — true for every "Already paid" backdated installment (035)
-- and for a real payment where no account was selected. A full purge then
-- reverses exactly (and only) the installments that have an account_id, to
-- exactly the account on that row — no guessing required, ever again.

alter table public.recurring_payment_occurrences
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

-- ---------------------------------------------------------------------------
-- _record_bill_payment / _record_liability_payment: persist account_id on
-- the occurrence row alongside everything else already recorded.
-- ---------------------------------------------------------------------------
create or replace function public._record_bill_payment(
  p_user uuid, p_occurrence uuid, p_amount numeric, p_date date,
  p_account_id uuid, p_category_id uuid, p_payment_method_id uuid,
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
  txn_id uuid;
begin
  select * into occ from public.recurring_payment_occurrences
    where id = p_occurrence and user_id = p_user for update;
  if not found then raise exception 'Payment not found'; end if;
  if occ.status = 'paid' then return occ; end if;               -- idempotent
  if occ.status = 'cancelled' then raise exception 'This payment was cancelled'; end if;
  if p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  select * into rec from public.recurring_transactions where id = occ.recurring_transaction_id;

  insert into public.transactions (
    user_id, account_id, category_id, payment_method_id, type, amount,
    description, transaction_date, source
  ) values (
    p_user, p_account_id, p_category_id, coalesce(p_payment_method_id, rec.payment_method_id),
    'expense', p_amount,
    coalesce(rec.name, rec.description, 'Recurring payment'), p_date, 'recurring'
  ) returning id into txn_id;

  update public.recurring_payment_occurrences set
    status = 'paid', paid_amount = p_amount, paid_at = p_date,
    transaction_id = txn_id, account_id = p_account_id, autopay_failed = false, updated_at = now()
  where id = occ.id
  returning * into occ;

  update public.recurring_transactions set
    last_processed_date = current_date, updated_at = now()
  where id = rec.id;

  perform public.generate_recurring_occurrences(rec.id, null);

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (p_user, 'payment_recorded',
          coalesce(rec.name, 'Payment') || ' recorded',
          to_char(p_amount, 'FM999999990D00'), 'success', occ.id);

  return occ;
end;
$$;

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

  -- interest leg: a real expense transaction, NO account (cash handled below).
  if p_interest > 0.005 then
    select coalesce(p_category_id, (
      select id from public.categories
      where user_id = p_user and type = 'expense' and name = 'Loan Interest' limit 1
    )) into interest_cat;
    insert into public.transactions (
      user_id, account_id, category_id, payment_method_id, type, amount,
      description, transaction_date, source
    ) values (
      p_user, null, interest_cat, coalesce(p_payment_method_id, rec.payment_method_id),
      'expense', p_interest,
      coalesce(lia.name, rec.name) || ' — interest', p_date, 'loan_interest'
    ) returning id into txn_id;
  end if;

  -- cash leg: the WHOLE EMI leaves the paying account.
  if p_account_id is not null then
    update public.accounts set current_balance = current_balance - p_amount, updated_at = now()
      where id = p_account_id and user_id = p_user and public.is_available_cash_account(type);
  end if;

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
-- delete_recurring_payment: p_hard now ALWAYS means a genuine full purge —
-- including paid history — instead of silently falling back to archiving
-- whenever any payment existed. The caller (UI) decides which one to ask
-- for; this just needs to do each one correctly:
--
--   p_hard = false  ->  archive (status = 'ended'), nothing deleted, nothing
--                       reversed — exactly the old default behaviour.
--   p_hard = true   ->  delete everything for this payment. For every paid
--                       occurrence that actually has an account_id (a real
--                       cash-out — never true for "Already paid" backdated
--                       installments), restore paid_amount to that exact
--                       account. Linked transactions are deleted too — for
--                       a plain bill that IS the cash leg (account_id set,
--                       so its own delete trigger correctly reverses the
--                       balance); for an EMI it's only ever the account_id
--                       = null interest leg, which the same trigger safely
--                       no-ops on.
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

  -- Hard path: reverse the real cash effect of every paid installment that
  -- had one — EMI's cash leg only, since a plain bill's full amount is
  -- already a normal transaction row and gets reversed below when it's
  -- deleted (its own account_id makes the standard balance trigger fire).
  if rec.kind = 'emi' then
    for o in
      select account_id, paid_amount from public.recurring_payment_occurrences
      where recurring_transaction_id = p_recurring and status = 'paid' and account_id is not null
    loop
      update public.accounts set current_balance = current_balance + o.paid_amount, updated_at = now()
        where id = o.account_id;
    end loop;
  end if;

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
