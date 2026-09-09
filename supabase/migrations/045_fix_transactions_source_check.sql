-- 045: fix a real bug introduced in 044 -- transactions_source_check never
--      got widened to allow the new 'loan_emi_payment' source value, so
--      _record_liability_payment()'s insert (and any manual correction of
--      an old row to the new source) fails the check constraint. This
--      means EVERY "Mark as paid" on an EMI has been broken since 044 was
--      deployed, not just the one-off manual correction that surfaced it.
--
-- Additive: keeps every existing allowed value (old rows still use
-- 'loan_interest'), just adds 'loan_emi_payment' to the list.
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual', 'lending_interest', 'recurring', 'loan_interest', 'loan_emi_payment'));
