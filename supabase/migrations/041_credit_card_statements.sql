-- 041: Credit Card Expense + Statement/Bill + Bill Payment flow.
--
-- THE CORE GAP THIS FIXES: get_financial_summary() already reads
-- accounts.metadata->>'current_outstanding' correctly into credit_card_debt
-- / available_balance / net_worth (available_balance already excludes
-- liability accounts; net_worth already subtracts credit_card_debt) -- but
-- nothing ever increased that number automatically. It was a field the user
-- had to type in by hand (AccountForm.jsx). A credit-card purchase already
-- correctly counts as a real expense transaction (apply_transaction_balance
-- already skips moving current_balance for a credit card, by design -- see
-- its own comment), and get_monthly_financial_summary's `expenses` is a
-- plain sum over all expense transactions regardless of account, so that
-- side was already right. This migration adds:
--
--   1. apply_credit_card_outstanding(): a transactions trigger, parallel to
--      the existing apply_transaction_balance trigger but for the opposite
--      account class -- a liability (credit card) account instead of a
--      cash-available one. An expense transaction on a card increases
--      metadata.current_outstanding; an income transaction (a refund/
--      cashback credited straight to the card) decreases it. Never touches
--      current_balance (still exclusively a cash concept, unchanged).
--
--   2. credit_card_statements: one row per card per billing period, amount
--      derived by SUMMING THE CARD'S ACTUAL TRANSACTIONS for that period --
--      never a second expense. generate_credit_card_statement() is
--      idempotent per (account_id, period_start, period_end) via a unique
--      constraint, matching the "must never generate duplicate statements"
--      requirement.
--
--   3. credit_card_payments + pay_credit_card_bill(): paying a statement
--      debits a real cash source account's current_balance and reduces the
--      card's metadata.current_outstanding directly -- NOT a transaction,
--      NOT an expense, exactly the same "pure cash movement, own dedicated
--      history table" pattern already used for account_transfers (040) and
--      lending's principal leg. Blocks paying a card from itself or from
--      another credit card, blocks overpaying past the outstanding balance,
--      and is idempotent via client_token -- same pattern as every other
--      payment-recording RPC in this app.
--
-- Net worth / available balance formulas in get_financial_summary() are
-- UNCHANGED -- they were already correct once current_outstanding actually
-- moves on its own, which is exactly what this migration makes happen.

-- ---------------------------------------------------------------------------
-- 1. Auto-track credit card outstanding from real transactions.
-- ---------------------------------------------------------------------------
create or replace function public.apply_credit_card_outstanding()
returns trigger
language plpgsql
as $$
declare
  old_is_cc boolean := false;
  new_is_cc boolean := false;
begin
  if tg_op in ('UPDATE','DELETE') and old.account_id is not null then
    select public.account_financial_type(type) = 'liability' into old_is_cc
      from public.accounts where id = old.account_id;
  end if;
  if tg_op in ('UPDATE','INSERT') and new.account_id is not null then
    select public.account_financial_type(type) = 'liability' into new_is_cc
      from public.accounts where id = new.account_id;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new_is_cc, false) then
      update public.accounts set metadata = jsonb_set(
          metadata, '{current_outstanding}',
          to_jsonb(greatest(0, coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0)
            + case when new.type = 'expense' then new.amount else -new.amount end)),
          true
        ), updated_at = now()
        where id = new.account_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if coalesce(old_is_cc, false) then
      update public.accounts set metadata = jsonb_set(
          metadata, '{current_outstanding}',
          to_jsonb(greatest(0, coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0)
            - case when old.type = 'expense' then old.amount else -old.amount end)),
          true
        ), updated_at = now()
        where id = old.account_id;
    end if;
    return old;
  else
    if coalesce(old_is_cc, false) then
      update public.accounts set metadata = jsonb_set(
          metadata, '{current_outstanding}',
          to_jsonb(greatest(0, coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0)
            - case when old.type = 'expense' then old.amount else -old.amount end)),
          true
        ), updated_at = now()
        where id = old.account_id;
    end if;
    if coalesce(new_is_cc, false) then
      update public.accounts set metadata = jsonb_set(
          metadata, '{current_outstanding}',
          to_jsonb(greatest(0, coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0)
            + case when new.type = 'expense' then new.amount else -new.amount end)),
          true
        ), updated_at = now()
        where id = new.account_id;
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_credit_card_outstanding on public.transactions;
create trigger trg_credit_card_outstanding
  after insert or update or delete on public.transactions
  for each row execute function public.apply_credit_card_outstanding();

-- ---------------------------------------------------------------------------
-- 2. Statements: one per card per billing period, amount derived from real
--    transactions -- never a second expense.
-- ---------------------------------------------------------------------------
create table if not exists public.credit_card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  statement_amount numeric(14,2) not null default 0 check (statement_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  due_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid','partially_paid','paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start),
  unique (account_id, period_start, period_end)
);

create index if not exists idx_ccs_user on public.credit_card_statements (user_id, due_date);
create index if not exists idx_ccs_account on public.credit_card_statements (account_id, period_start desc);

alter table public.credit_card_statements enable row level security;
drop policy if exists "own_select" on public.credit_card_statements;
create policy "own_select" on public.credit_card_statements
  for select using (user_id = auth.uid());
grant select on public.credit_card_statements to authenticated;
revoke insert, update, delete on public.credit_card_statements from authenticated, anon;

create or replace function public.generate_credit_card_statement(
  p_account uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date
)
returns public.credit_card_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  acct public.accounts;
  v_total numeric(14,2);
  stmt public.credit_card_statements;
begin
  select * into acct from public.accounts
    where id = p_account and user_id = auth.uid() for update;
  if not found then raise exception 'Account not found'; end if;
  if public.account_financial_type(acct.type) <> 'liability' then
    raise exception 'Only a credit card account can have a statement';
  end if;
  if p_period_end <= p_period_start then
    raise exception 'Statement period end must be after the start';
  end if;
  if p_due_date < p_period_end then
    raise exception 'Due date cannot be before the statement period ends';
  end if;

  -- The statement amount IS the sum of the card's own real transactions for
  -- the period -- this never inserts a transaction of its own.
  select coalesce(sum(case when type = 'expense' then amount else -amount end), 0) into v_total
  from public.transactions
  where account_id = p_account and user_id = auth.uid()
    and transaction_date >= p_period_start and transaction_date < p_period_end;

  insert into public.credit_card_statements (
    user_id, account_id, period_start, period_end, statement_amount, due_date
  ) values (
    auth.uid(), p_account, p_period_start, p_period_end, greatest(0, v_total), p_due_date
  )
  on conflict (account_id, period_start, period_end) do nothing
  returning * into stmt;

  if stmt.id is null then
    -- Already existed (idempotent retry / duplicate click) -- return it as-is.
    select * into stmt from public.credit_card_statements
      where account_id = p_account and period_start = p_period_start and period_end = p_period_end;
  end if;

  return stmt;
end;
$$;

grant execute on function public.generate_credit_card_statement(uuid, date, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Paying a statement: pure cash movement (source account current_balance
--    down, card's metadata.current_outstanding down) -- never a transaction,
--    never a second expense.
-- ---------------------------------------------------------------------------
create table if not exists public.credit_card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  statement_id uuid references public.credit_card_statements(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete cascade,        -- the credit card
  source_account_id uuid not null references public.accounts(id) on delete cascade, -- where the cash came from
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  notes text,
  client_token uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_ccp_client_token
  on public.credit_card_payments (user_id, client_token) where client_token is not null;
create index if not exists idx_ccp_user on public.credit_card_payments (user_id, payment_date desc);
create index if not exists idx_ccp_statement on public.credit_card_payments (statement_id);

alter table public.credit_card_payments enable row level security;
drop policy if exists "own_select" on public.credit_card_payments;
create policy "own_select" on public.credit_card_payments
  for select using (user_id = auth.uid());
grant select on public.credit_card_payments to authenticated;
revoke insert, update, delete on public.credit_card_payments from authenticated, anon;

create or replace function public.pay_credit_card_bill(
  p_account uuid,            -- credit card being paid
  p_source_account uuid,     -- cash/bank/wallet/other account paying it
  p_amount numeric,
  p_statement_id uuid default null,
  p_date date default current_date,
  p_notes text default null,
  p_client_token uuid default null
)
returns public.credit_card_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.accounts;
  src public.accounts;
  stmt public.credit_card_statements;
  outstanding numeric(14,2);
  pay public.credit_card_payments;
begin
  if p_client_token is not null then
    select * into pay from public.credit_card_payments
      where user_id = auth.uid() and client_token = p_client_token;
    if found then return pay; end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than 0';
  end if;
  if p_account = p_source_account then
    raise exception 'Cannot pay a credit card bill from the same credit card';
  end if;

  select * into card from public.accounts
    where id = p_account and user_id = auth.uid() for update;
  if not found then raise exception 'Credit card account not found'; end if;
  if public.account_financial_type(card.type) <> 'liability' then
    raise exception 'This is not a credit card account';
  end if;

  select * into src from public.accounts
    where id = p_source_account and user_id = auth.uid() for update;
  if not found then raise exception 'Source account not found'; end if;
  if not public.is_available_cash_account(src.type) then
    raise exception 'Pay from a bank, cash, wallet or other cash account -- not another credit card';
  end if;

  outstanding := coalesce(nullif(card.metadata->>'current_outstanding','')::numeric, 0);
  if p_amount > outstanding + 0.01 then
    raise exception 'Payment amount exceeds the outstanding balance (%).', to_char(outstanding, 'FM999999990D00');
  end if;
  if src.current_balance < p_amount then
    raise exception 'Insufficient balance in the source account';
  end if;

  if p_statement_id is not null then
    select * into stmt from public.credit_card_statements
      where id = p_statement_id and user_id = auth.uid() and account_id = p_account for update;
    if not found then raise exception 'Statement not found'; end if;
  end if;

  -- The two cash-movement legs. Neither touches public.transactions, so
  -- Income/Expense/Analytics can never see this as a second expense.
  update public.accounts set current_balance = current_balance - p_amount, updated_at = now()
    where id = p_source_account;
  update public.accounts set metadata = jsonb_set(
      metadata, '{current_outstanding}', to_jsonb(greatest(0, outstanding - p_amount)), true
    ), updated_at = now()
    where id = p_account;

  if stmt.id is not null then
    update public.credit_card_statements set
      paid_amount = paid_amount + p_amount,
      status = case
        when paid_amount + p_amount >= statement_amount - 0.01 then 'paid'
        when paid_amount + p_amount > 0 then 'partially_paid'
        else status
      end,
      updated_at = now()
    where id = stmt.id;
  end if;

  insert into public.credit_card_payments (
    user_id, statement_id, account_id, source_account_id, amount, payment_date, notes, client_token
  ) values (
    auth.uid(), p_statement_id, p_account, p_source_account, p_amount,
    coalesce(p_date, current_date), p_notes, p_client_token
  ) returning * into pay;

  return pay;
end;
$$;

grant execute on function public.pay_credit_card_bill(uuid, uuid, numeric, uuid, date, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Deleting an account today (useAccounts.js's `remove`) is a plain
--    unguarded `delete()` from the client, for every account type -- there
--    is no existing RPC or guard to extend. Block it specifically for a
--    credit card that still carries debt, so deleting the account can never
--    silently lose track of money owed. Non-credit-card accounts, and a
--    credit card with zero outstanding, are completely unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.block_credit_card_delete_with_debt()
returns trigger
language plpgsql
as $$
begin
  if public.account_financial_type(old.type) = 'liability'
     and coalesce(nullif(old.metadata->>'current_outstanding','')::numeric, 0) > 0.005 then
    raise exception 'Cannot delete a credit card with an outstanding balance of %. Pay it off (or edit the outstanding to 0) first.',
      to_char(coalesce(nullif(old.metadata->>'current_outstanding','')::numeric, 0), 'FM999999990D00');
  end if;
  return old;
end;
$$;

drop trigger if exists trg_block_credit_card_delete on public.accounts;
create trigger trg_block_credit_card_delete
  before delete on public.accounts
  for each row execute function public.block_credit_card_delete_with_debt();
