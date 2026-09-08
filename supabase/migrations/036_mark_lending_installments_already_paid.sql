-- 036: the same "already paid" concept as EMIs (035), for money you've
--      lent with a repayment schedule -- e.g. entering a loan you gave
--      months ago where the borrower has already repaid a few installments.
--
-- mark_lending_installments_already_paid(p_record, p_count) marks the first
-- p_count installments of a lending schedule as fully paid, WITHOUT
-- crediting any account and WITHOUT creating an interest-income
-- transaction -- that money already came back to the lender before they
-- started tracking it here, so crediting it again now would double-count
-- it. Contrast with record_lending_repayment(), which is for a real
-- repayment happening right now (credits the account, creates the
-- interest transaction).
--
-- Deliberately reuses recompute_lending_from_installments() to derive
-- principal_received/interest_received/status/overdue/next-due from the
-- installments afterwards -- the exact same place record_lending_repayment()
-- goes -- rather than duplicating that math here.
create or replace function public.mark_lending_installments_already_paid(
  p_record uuid,
  p_count int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.lending_records;
  v_rows int := 0;
begin
  if p_count is null or p_count <= 0 then return; end if;

  select * into rec from public.lending_records
    where id = p_record and user_id = auth.uid() for update;
  if not found then raise exception 'Lending record not found'; end if;
  if not rec.schedule_generated then
    raise exception 'This loan has no installment schedule yet';
  end if;

  update public.lending_installments
    set principal_paid = principal_amount,
        interest_paid = interest_amount,
        paid_amount = principal_amount + interest_amount,
        updated_at = now()
  where lending_record_id = p_record
    and installment_number <= p_count
    and status <> 'cancelled';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return; end if;

  perform public.recompute_lending_from_installments(p_record);
end;
$$;

grant execute on function public.mark_lending_installments_already_paid(uuid, int) to authenticated;
