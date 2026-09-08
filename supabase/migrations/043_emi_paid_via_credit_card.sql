-- 043: support an EMI whose "Payment account" is a credit card -- i.e. a
--      real "Convert to EMI" purchase, where the bank bills each
--      installment straight onto the card's own monthly statement rather
--      than debiting a separate bank account.
--
-- Before this: _record_liability_payment()'s cash leg only ever did
--   update accounts set current_balance = current_balance - p_amount
--     where id = p_account_id and ... and is_available_cash_account(type)
-- The is_available_cash_account() guard means that WHERE clause matches
-- ZERO rows when p_account_id is a credit card -- so marking an EMI
-- installment "paid" against a credit card payment account silently did
-- nothing at all: no debit, no increase to the card's outstanding, the
-- money the bank actually billed you was invisible everywhere.
--
-- Fix: when the EMI's payment account is a credit card, the installment
-- amount now increases that card's metadata.current_outstanding instead --
-- exactly what a real EMI-on-card charge does each billing cycle. The
-- resulting card debt then flows through the existing Credit Card Bills /
-- Pay Bill feature (041/042) like any other card charge. When the payment
-- account is a normal cash account, behaviour is completely unchanged.
--
-- _record_bill_payment() (plain bills/subscriptions) already handles a
-- credit-card payment account correctly without any change here: it
-- inserts a real row into public.transactions, and the existing
-- apply_credit_card_outstanding trigger (042) picks that up automatically.
-- Only the EMI path bypasses transactions for its principal leg (only the
-- interest leg gets a transactions row), which is why it needed this
-- explicit fix.
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
  pay_acct public.accounts;
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

  -- cash/card leg: the WHOLE EMI installment leaves the paying account --
  -- OR, if the payment account is a credit card, gets charged onto it.
  if p_account_id is not null then
    select * into pay_acct from public.accounts where id = p_account_id and user_id = p_user;
    if found and public.is_available_cash_account(pay_acct.type) then
      update public.accounts set current_balance = current_balance - p_amount, updated_at = now()
        where id = p_account_id;
    elsif found and public.account_financial_type(pay_acct.type) = 'liability' then
      update public.accounts set metadata = jsonb_set(
          metadata, '{current_outstanding}',
          to_jsonb(greatest(0, coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0) + p_amount)),
          true
        ), updated_at = now()
        where id = p_account_id;
    end if;
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
