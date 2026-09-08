-- 035: let an EMI be created with some installments already paid outside
--      the app (e.g. importing a loan that's a year into repayment).
--
-- mark_emi_already_paid(p_recurring, p_count) flips the first p_count
-- occurrences of an EMI straight to 'paid' and rolls their principal/
-- interest into the liability's running totals -- WITHOUT touching any
-- account balance and WITHOUT creating an expense/interest transaction.
-- That money already left the user's account before they started tracking
-- it here, so re-deducting it now would double-count it against their
-- current balance. Contrast with _record_liability_payment(), which is for
-- a real payment happening right now (debits the account, creates the
-- interest transaction) -- this is purely a starting-state correction.
--
-- Must run AFTER generate_recurring_occurrences() has materialised the
-- schedule, since it only touches occurrences that already exist.
create or replace function public.mark_emi_already_paid(
  p_recurring uuid,
  p_count int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.recurring_transactions;
  lia public.liabilities;
  v_principal numeric(14,2) := 0;
  v_interest numeric(14,2) := 0;
  v_rows int := 0;
begin
  if p_count is null or p_count <= 0 then return; end if;

  select * into rec from public.recurring_transactions
    where id = p_recurring and user_id = auth.uid();
  if not found then raise exception 'Recurring payment not found'; end if;
  if rec.kind <> 'emi' or rec.liability_id is null then
    raise exception 'Only an EMI / loan can have already-paid installments';
  end if;

  select * into lia from public.liabilities where id = rec.liability_id for update;
  if not found then raise exception 'Loan not found'; end if;

  select coalesce(sum(principal_amount), 0), coalesce(sum(interest_amount), 0), count(*)
    into v_principal, v_interest, v_rows
  from public.recurring_payment_occurrences
  where recurring_transaction_id = p_recurring
    and installment_number <= p_count
    and status in ('upcoming', 'due', 'overdue');

  if v_rows = 0 then return; end if;

  update public.recurring_payment_occurrences
    set status = 'paid',
        paid_amount = scheduled_amount,
        paid_at = due_date,
        transaction_id = null,
        updated_at = now()
  where recurring_transaction_id = p_recurring
    and installment_number <= p_count
    and status in ('upcoming', 'due', 'overdue');

  update public.liabilities set
    outstanding_principal = greatest(0, outstanding_principal - v_principal),
    principal_paid = principal_paid + v_principal,
    interest_paid = interest_paid + v_interest,
    installments_paid = installments_paid + v_rows,
    status = case when outstanding_principal - v_principal <= 0.005 then 'closed' else status end,
    updated_at = now()
  where id = lia.id;

  update public.recurring_transactions set
    last_processed_date = current_date,
    status = case when (select outstanding_principal from public.liabilities where id = lia.id) <= 0.005
                  then 'ended' else status end,
    next_run_date = coalesce((
      select min(due_date) from public.recurring_payment_occurrences
      where recurring_transaction_id = rec.id and status in ('upcoming','due','overdue')
    ), rec.next_run_date),
    updated_at = now()
  where id = rec.id;
end;
$$;

grant execute on function public.mark_emi_already_paid(uuid, int) to authenticated;
