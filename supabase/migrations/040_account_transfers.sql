-- 040: money transfer between two of the user's own accounts.
--
-- Deliberately does NOT touch public.transactions -- a transfer isn't real
-- income or expense (nothing was earned or spent, money just moved), and
-- inflating both the source and destination sides would corrupt Income/
-- Expense totals in Analytics/Reports/Dashboard. Same reasoning already
-- applied to lending's principal leg and an EMI's cash leg elsewhere in
-- this schema: pure cash movement between two of the user's own accounts
-- updates current_balance directly, with its own dedicated history table
-- for a real audit trail, rather than going through transactions.
--
-- Credit cards are excluded on BOTH sides, not just as a source. This app
-- tracks credit card debt entirely separately (accounts.metadata->>
-- 'current_outstanding', a field the user edits by hand in AccountForm.jsx)
-- -- current_balance is never used for a credit card's debt at all (see
-- apply_transaction_balance()'s existing guard for the same reasoning on
-- the transactions side). Crediting a credit card's current_balance via a
-- transfer would move a number nobody looks at while leaving the actual
-- tracked debt completely unchanged -- confusing and wrong, so it's a hard
-- guard here rather than a UI-only restriction.

create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null references public.accounts(id) on delete cascade,
  to_account_id uuid not null references public.accounts(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  transfer_date date not null default current_date,
  notes text,
  client_token uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_account_transfers_client_token
  on public.account_transfers (user_id, client_token) where client_token is not null;
create index if not exists idx_account_transfers_user
  on public.account_transfers (user_id, transfer_date desc);

alter table public.account_transfers enable row level security;
drop policy if exists "own_select" on public.account_transfers;
create policy "own_select" on public.account_transfers
  for select using (user_id = auth.uid());

-- Defense in depth, same pattern as every other financial-history table in
-- this schema: only the SECURITY DEFINER RPC below may write.
grant select on public.account_transfers to authenticated;
revoke insert, update, delete on public.account_transfers from authenticated, anon;

create or replace function public.transfer_between_accounts(
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_date date default current_date,
  p_notes text default null,
  p_client_token uuid default null
)
returns public.account_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  from_acct public.accounts;
  to_acct public.accounts;
  xfer public.account_transfers;
begin
  if p_client_token is not null then
    select * into xfer from public.account_transfers
      where user_id = auth.uid() and client_token = p_client_token;
    if found then return xfer; end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be greater than 0';
  end if;
  if p_from_account = p_to_account then
    raise exception 'Choose two different accounts';
  end if;

  select * into from_acct from public.accounts
    where id = p_from_account and user_id = auth.uid() for update;
  if not found then raise exception 'Source account not found'; end if;

  select * into to_acct from public.accounts
    where id = p_to_account and user_id = auth.uid() for update;
  if not found then raise exception 'Destination account not found'; end if;

  if not public.is_available_cash_account(from_acct.type) then
    raise exception 'Cannot transfer out of a credit card -- its balance tracks debt, not cash.';
  end if;
  if not public.is_available_cash_account(to_acct.type) then
    raise exception 'Cannot transfer into a credit card -- its balance tracks debt, not cash. Edit the card''s outstanding amount directly instead.';
  end if;

  if from_acct.current_balance < p_amount then
    raise exception 'Insufficient balance in the source account';
  end if;

  update public.accounts set current_balance = current_balance - p_amount, updated_at = now()
    where id = p_from_account;
  update public.accounts set current_balance = current_balance + p_amount, updated_at = now()
    where id = p_to_account;

  insert into public.account_transfers (
    user_id, from_account_id, to_account_id, amount, transfer_date, notes, client_token
  ) values (
    auth.uid(), p_from_account, p_to_account, p_amount, coalesce(p_date, current_date), p_notes, p_client_token
  ) returning * into xfer;

  return xfer;
end;
$$;

grant execute on function public.transfer_between_accounts(uuid, uuid, numeric, date, text, uuid) to authenticated;
