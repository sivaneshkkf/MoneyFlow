-- 021_lending_record_delete.sql
-- =========================================================================
-- Atomic, financially-correct deletion of a whole lending record.
--
-- The frontend previously did  supabase.from('lending_records').delete()
-- and relied purely on FK cascades. That left two things wrong:
--
--   1. transactions with source = 'lending_interest' were orphaned
--      (transactions.lending_repayment_id has NO foreign key) and kept
--      counting as income in the dashboard / analytics / reports.
--
--   2. cash a repayment paid INTO an account (lending_repayments.account_id)
--      was never reversed — only delete_lending_repayment() does that, and
--      the cascade bypasses it.
--
-- This RPC reverses every repayment with the SAME accounting rules as
-- delete_lending_repayment() (migration 018), then deletes the parent row.
--
-- The existing AFTER DELETE trigger  trg_lending_cash_out  (migration 007)
-- still refunds the ORIGINAL principal to lending_records.account_id, and
-- only when it is not null. We do NOT duplicate that here.
--
-- FK cascades still clean up:
--   lending_repayments, lending_installments, lending_repayment_allocations.
--
-- Nothing about the installment-schedule logic or the financial model is
-- changed. Existing functions are untouched.
-- =========================================================================

create or replace function public.delete_lending_record(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.lending_records;
  rep public.lending_repayments;
begin
  -- STEP 1 + 2: ownership check + row lock. record_lending_repayment() also
  -- takes FOR UPDATE on this row, so a concurrent repayment/delete serialises
  -- here instead of corrupting balances.
  select * into rec from public.lending_records
    where id = p_id and user_id = auth.uid()
    for update;
  if not found then
    -- not the caller's record, or already deleted → idempotent no-op
    return;
  end if;

  -- STEP 3: reverse every repayment BEFORE the cascade removes them.
  for rep in
    select * from public.lending_repayments
      where lending_record_id = p_id and user_id = auth.uid()
      for update
  loop
    -- 3A. Cash the repayment paid into an account — mirror delete_lending_repayment():
    --     subtract the full repayment amount, cash accounts only, owner only.
    if rep.account_id is not null then
      update public.accounts
        set current_balance = current_balance - rep.amount, updated_at = now()
        where id = rep.account_id and user_id = auth.uid()
          and public.is_available_cash_account(type);
    end if;
  end loop;

  -- 3B. Interest-income transactions for those repayments. These are inserted
  --     with account_id = NULL, so deleting them moves no account balance
  --     (apply_transaction_balance no-ops on a null account) — but they must
  --     not survive as orphans inflating income.
  delete from public.transactions
    where user_id = auth.uid()
      and source = 'lending_interest'
      and lending_repayment_id in (
        select id from public.lending_repayments where lending_record_id = p_id
      );

  -- STEP 4 (automatic): the DELETE below fires trg_lending_cash_out, which
  -- refunds rec.principal_amount to rec.account_id when it is not null.
  --
  -- STEP 5: delete the parent. FK cascades remove lending_repayments,
  -- lending_installments and lending_repayment_allocations.
  delete from public.lending_records where id = p_id and user_id = auth.uid();
end;
$$;

grant execute on function public.delete_lending_record(uuid) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================================
-- Deterministic verification scenario (run manually as an authenticated user;
-- NOT executed by this migration). Mirrors "Example 3" from the spec.
--
--   -- setup
--   insert into public.accounts (user_id, name, type, opening_balance, current_balance)
--     values (auth.uid(), 'Test Bank', 'Bank Account', 100000, 100000)
--     returning id;                                   -- => :acct
--
--   -- lend 100000 from :acct  (trg_lending_cash_out: bank 100000 -> 0)
--   insert into public.lending_records
--     (user_id, borrower_name, principal_amount, interest_type, interest_amount,
--      lending_date, account_id)
--     values (auth.uid(), 'Test Borrower', 100000, 'fixed', 5000,
--             current_date, :acct)
--     returning id;                                   -- => :loan
--
--   -- repay 25000 principal + 5000 interest into :acct
--   select public.record_lending_repayment(
--     :loan, 30000, 25000, 5000, current_date, :acct, null, null, null, null);
--   --   bank: 0 -> 30000
--   --   one transaction  source='lending_interest'  amount=5000  (income)
--
--   -- BEFORE delete
--   select current_balance from public.accounts where id = :acct;        -- 30000
--   select coalesce(sum(amount),0) from public.transactions
--     where type='income' and source='lending_interest';                 -- 5000
--   select coalesce(sum(outstanding_principal+outstanding_interest),0)
--     from public.lending_records where id = :loan;                      -- 80000
--
--   -- ACT
--   select public.delete_lending_record(:loan);
--
--   -- AFTER delete  (as if the loan never existed)
--   select current_balance from public.accounts where id = :acct;        -- 100000
--   select count(*) from public.lending_records         where id = :loan;-- 0
--   select count(*) from public.lending_repayments      where lending_record_id = :loan; -- 0
--   select count(*) from public.lending_installments    where lending_record_id = :loan; -- 0
--   select count(*) from public.transactions
--     where source='lending_interest';                                   -- 0 (no orphan)
--
-- Idempotency:  select public.delete_lending_record(:loan);  -- no error, no-op
-- Unauthorized: another user calling it with :loan          -- no-op (not found)
-- =========================================================================
