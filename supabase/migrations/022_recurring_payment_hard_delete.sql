-- 022_recurring_payment_hard_delete.sql
-- =========================================================================
-- Make "Delete" on a Bill / EMI / subscription actually remove it when there
-- is no payment history, and clean up its stale reminder alerts either way.
--
--   * No paid occurrences  -> hard delete: the recurring_transactions row is
--     removed (FK cascade drops its recurring_payment_occurrences), the linked
--     EMI liabilities row is removed, and all of its alerts are removed.
--
--   * Has paid occurrences  -> soft delete (unchanged): status = 'ended',
--     is_active = false; non-paid occurrences -> 'cancelled'. Every recorded
--     payment + its transaction is preserved, exactly as before.
--
-- Stale actionable alerts (bill_due / bill_overdue / payment_failed) for this
-- payment's occurrences are cleared in BOTH cases — they are notices, not
-- history. 'payment_recorded' alerts are kept on the soft path.
--
-- Only public.delete_recurring_payment(uuid, boolean) is replaced. Signature,
-- return type and grants are unchanged. Nothing else is touched.
-- =========================================================================

create or replace function public.delete_recurring_payment(p_recurring uuid, p_hard boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.recurring_transactions;
  has_paid boolean;
begin
  select * into rec from public.recurring_transactions
    where id = p_recurring and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'Recurring payment not found';
  end if;

  select exists (
    select 1 from public.recurring_payment_occurrences
    where recurring_transaction_id = p_recurring and status = 'paid'
  ) into has_paid;

  -- Always clear stale actionable alerts for this payment's occurrences.
  delete from public.alerts
    where user_id = auth.uid()
      and type in ('bill_due', 'bill_overdue', 'payment_failed')
      and related_id in (
        select id from public.recurring_payment_occurrences
        where recurring_transaction_id = p_recurring
      );

  -- Non-paid occurrences: cancel (soft) — a hard delete drops them via cascade.
  update public.recurring_payment_occurrences
    set status = 'cancelled', updated_at = now()
    where recurring_transaction_id = p_recurring and status <> 'paid';

  if p_hard and not has_paid then
    -- No payment history anywhere -> remove everything for this payment.
    delete from public.alerts
      where user_id = auth.uid()
        and related_id in (
          select id from public.recurring_payment_occurrences
          where recurring_transaction_id = p_recurring
        );
    -- FK cascade removes recurring_payment_occurrences.
    delete from public.recurring_transactions where id = p_recurring and user_id = auth.uid();
    if rec.liability_id is not null then
      delete from public.liabilities
        where id = rec.liability_id and user_id = auth.uid();
    end if;
  else
    -- Keep as history — just end it. Recorded payments + transactions untouched.
    update public.recurring_transactions
      set status = 'ended', is_active = false, updated_at = now()
      where id = p_recurring;
  end if;
end;
$$;

grant execute on function public.delete_recurring_payment(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
