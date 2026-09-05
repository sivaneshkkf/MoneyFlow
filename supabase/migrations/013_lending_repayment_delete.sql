-- 013_lending_repayment_delete.sql
-- Atomic reversal of a lending repayment: undo lending totals, account cash,
-- and the linked interest-income transaction.
create or replace function public.delete_lending_repayment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rep public.lending_repayments;
begin
  select * into rep from public.lending_repayments
    where id = p_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'Repayment not found';
  end if;

  update public.lending_records set
    principal_received = greatest(0, principal_received - rep.principal_amount),
    interest_received = greatest(0, interest_received - rep.interest_amount)
  where id = rep.lending_record_id and user_id = auth.uid();

  if rep.account_id is not null then
    update public.accounts set current_balance = current_balance - rep.amount, updated_at = now()
      where id = rep.account_id and user_id = auth.uid();
  end if;

  -- Remove the interest-income transaction we created for this repayment.
  delete from public.transactions
    where lending_repayment_id = rep.id and source = 'lending_interest' and user_id = auth.uid();

  delete from public.lending_repayments where id = p_id;
end;
$$;

grant execute on function public.delete_lending_repayment(uuid) to authenticated;
