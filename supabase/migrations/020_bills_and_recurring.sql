-- 020_bills_and_recurring.sql
-- =========================================================================
-- Bills & Recurring Payments module.
--
--   USER  ->  Bank / Company / Service provider          (this module)
--   Borrower  ->  USER                                     (lending, untouched)
--
-- These are kept as completely separate financial concepts. Nothing here
-- touches lending_records / lending_installments / lending_repayments or the
-- record_/delete_lending_repayment functions.
--
-- Accounting rules
--   Bill / Subscription / Recurring: cash -X, expense +X   (one normal expense txn)
--   EMI / Loan (kind='emi'):
--       cash            -EMI            (RPC adjusts the account directly)
--       interest expense +interest      (one expense txn, account_id NULL)
--       loan liability  -principal      (liabilities.outstanding_principal)
--     => net worth changes only by the interest, exactly like real amortisation.
--
-- Future / unpaid occurrences never affect balances, expenses, cash flow,
-- analytics or reports. Only a recorded payment (a real transaction, or the
-- RPC's explicit liability/cash adjustment) moves money.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Loan liabilities (money the USER owes). Not an account, not a lending
--    record. Denormalised rollups for cheap list/detail/dashboard queries.
-- -------------------------------------------------------------------------
create table if not exists public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  lender_name text,
  original_principal numeric(14,2) not null check (original_principal >= 0),
  interest_rate numeric(6,3) not null default 0 check (interest_rate >= 0),   -- annual %
  outstanding_principal numeric(14,2) not null default 0 check (outstanding_principal >= 0),
  principal_paid numeric(14,2) not null default 0 check (principal_paid >= 0),
  interest_paid numeric(14,2) not null default 0 check (interest_paid >= 0),
  installments_total int not null default 0 check (installments_total >= 0),
  installments_paid int not null default 0 check (installments_paid >= 0),
  emi_amount numeric(14,2) not null default 0 check (emi_amount >= 0),
  start_date date not null default current_date,
  account_id uuid references public.accounts(id) on delete set null,
  status text not null default 'active' check (status in ('active','closed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_liabilities_user on public.liabilities (user_id, status);

-- -------------------------------------------------------------------------
-- 2. Extend the EXISTING recurring_transactions table (the payment
--    definition). All additive, all optional / defaulted.
-- -------------------------------------------------------------------------
alter table public.recurring_transactions
  add column if not exists name text,
  add column if not exists kind text not null default 'recurring',
  add column if not exists merchant_name text,
  add column if not exists notes text,
  add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null,
  add column if not exists liability_id uuid references public.liabilities(id) on delete cascade,
  add column if not exists due_day smallint check (due_day between 1 and 31),
  add column if not exists due_weekday smallint check (due_weekday between 0 and 6),
  add column if not exists due_month smallint check (due_month between 1 and 12),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists autopay boolean not null default false,
  add column if not exists reminder_days_before smallint not null default 3 check (reminder_days_before >= 0),
  add column if not exists last_processed_date date,
  add column if not exists emi_principal numeric(14,2) check (emi_principal >= 0),
  add column if not exists emi_interest numeric(14,2) check (emi_interest >= 0),
  add column if not exists status text not null default 'active';

-- widen frequency + add kind / status check constraints (safe: existing rows
-- already satisfy the defaults).
do $$
begin
  alter table public.recurring_transactions drop constraint if exists recurring_transactions_frequency_check;
  alter table public.recurring_transactions
    add constraint recurring_transactions_frequency_check
    check (frequency in ('one_time','daily','weekly','biweekly','monthly','quarterly','yearly'));

  alter table public.recurring_transactions drop constraint if exists recurring_transactions_kind_check;
  alter table public.recurring_transactions
    add constraint recurring_transactions_kind_check
    check (kind in ('bill','emi','subscription','recurring'));

  alter table public.recurring_transactions drop constraint if exists recurring_transactions_status_check;
  alter table public.recurring_transactions
    add constraint recurring_transactions_status_check
    check (status in ('active','paused','ended'));
exception when others then
  raise notice 'recurring_transactions constraint update skipped: %', sqlerrm;
end $$;

-- backfill name / start_date for any pre-existing rows
update public.recurring_transactions
  set name = coalesce(name, description, 'Recurring payment'),
      start_date = coalesce(start_date, next_run_date, current_date)
  where name is null or start_date is null;

create index if not exists idx_recurring_user_status on public.recurring_transactions (user_id, status);
create index if not exists idx_recurring_next_run on public.recurring_transactions (next_run_date) where status = 'active';
create index if not exists idx_recurring_liability on public.recurring_transactions (liability_id);

-- -------------------------------------------------------------------------
-- 3. Occurrences: one materialised, dated instance of a recurring payment.
--    unique(recurring_transaction_id, due_date) => idempotent generation.
-- -------------------------------------------------------------------------
create table if not exists public.recurring_payment_occurrences (
  id uuid primary key default gen_random_uuid(),
  recurring_transaction_id uuid not null references public.recurring_transactions(id) on delete cascade,
  liability_id uuid references public.liabilities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  installment_number int,
  due_date date not null,
  scheduled_amount numeric(14,2) not null check (scheduled_amount >= 0),
  principal_amount numeric(14,2) not null default 0 check (principal_amount >= 0),
  interest_amount numeric(14,2) not null default 0 check (interest_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'upcoming'
    check (status in ('upcoming','due','overdue','paid','skipped','cancelled')),
  transaction_id uuid references public.transactions(id) on delete set null,
  paid_at date,
  autopay_failed boolean not null default false,
  reminded_upcoming boolean not null default false,
  reminded_due boolean not null default false,
  reminded_overdue boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recurring_transaction_id, due_date)
);

create index if not exists idx_occ_user_due on public.recurring_payment_occurrences (user_id, due_date);
create index if not exists idx_occ_user_status on public.recurring_payment_occurrences (user_id, status);
create index if not exists idx_occ_recurring on public.recurring_payment_occurrences (recurring_transaction_id, due_date);
create index if not exists idx_occ_liability on public.recurring_payment_occurrences (liability_id);
create index if not exists idx_occ_open_due
  on public.recurring_payment_occurrences (user_id, due_date)
  where status in ('upcoming','due','overdue');

-- allow a new transactions.source value for the interest leg of an EMI + the
-- normal recurring-payment leg. (Widen the existing check.)
do $$
begin
  alter table public.transactions drop constraint if exists transactions_source_check;
  alter table public.transactions
    add constraint transactions_source_check
    check (source in ('manual','lending_interest','recurring','loan_interest'));
exception when others then
  raise notice 'transactions_source_check update skipped: %', sqlerrm;
end $$;

-- -------------------------------------------------------------------------
-- 4. RLS  (identical owner-only pattern used everywhere else)
-- -------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['liabilities','recurring_payment_occurrences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);
    execute format('create policy "own_select" on public.%I for select using (user_id = auth.uid())', t);
    execute format('create policy "own_insert" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "own_update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own_delete" on public.%I for delete using (user_id = auth.uid())', t);
  end loop;
end $$;

grant select, insert, update, delete on public.liabilities to authenticated;
grant select, insert, update, delete on public.recurring_payment_occurrences to authenticated;

-- -------------------------------------------------------------------------
-- 5. Seed a "Loan Interest" expense category (new + existing users).
-- -------------------------------------------------------------------------
insert into public.categories (user_id, name, type, icon, color, is_default)
select id, 'Loan Interest', 'expense', 'Landmark', '#EF4444', true
from auth.users u
where not exists (
  select 1 from public.categories c
  where c.user_id = u.id and c.type = 'expense' and c.name = 'Loan Interest'
);

create or replace function public.seed_user_defaults(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, type, icon, color, is_default)
  values
    (p_user,'Housing','expense','Home','#315C54',true),
    (p_user,'Food','expense','Utensils','#2F6F63',true),
    (p_user,'Transportation','expense','Car','#3B82F6',true),
    (p_user,'Bills','expense','ReceiptText','#F59E0B',true),
    (p_user,'Shopping','expense','ShoppingBag','#8B5CF6',true),
    (p_user,'Entertainment','expense','Clapperboard','#EC4899',true),
    (p_user,'Healthcare','expense','HeartPulse','#EF4444',true),
    (p_user,'Education','expense','GraduationCap','#0EA5E9',true),
    (p_user,'Loan Interest','expense','Landmark','#EF4444',true),
    (p_user,'Other','expense','Boxes','#7C9B95',true),
    (p_user,'Salary','income','Wallet','#22C55E',true),
    (p_user,'Freelance','income','Laptop','#2F6F63',true),
    (p_user,'Business','income','Briefcase','#315C54',true),
    (p_user,'Bonus','income','Gift','#F59E0B',true),
    (p_user,'Investment','income','TrendingUp','#3B82F6',true),
    (p_user,'Rental','income','Building2','#8B5CF6',true),
    (p_user,'Interest','income','Percent','#0EA5E9',true),
    (p_user,'Other','income','Boxes','#7C9B95',true)
  on conflict do nothing;

  insert into public.payment_methods (user_id, name, is_default)
  values
    (p_user,'Cash',true),(p_user,'UPI',false),(p_user,'Bank Transfer',false),
    (p_user,'Credit Card',false),(p_user,'Debit Card',false),(p_user,'Wallet',false),(p_user,'Other',false)
  on conflict do nothing;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Date helper: first due date on/after p_from for a frequency.
-- -------------------------------------------------------------------------
create or replace function public.recurring_first_due(
  p_from date, p_freq text, p_day smallint, p_weekday smallint, p_month smallint
)
returns date
language plpgsql
immutable
as $$
declare
  d date;
  target_dom int;
  y int;
begin
  if p_freq = 'one_time' then
    return p_from;
  elsif p_freq = 'daily' then
    return p_from;
  elsif p_freq in ('weekly','biweekly') then
    d := p_from;
    -- advance to the requested weekday (extract dow: 0=Sun..6=Sat)
    if p_weekday is not null then
      d := d + ((p_weekday - extract(dow from d)::int + 7) % 7);
    end if;
    return d;
  elsif p_freq in ('monthly','quarterly') then
    target_dom := coalesce(p_day, extract(day from p_from)::int);
    d := make_date(extract(year from p_from)::int, extract(month from p_from)::int, 1);
    d := least(d + (target_dom - 1), (d + interval '1 month - 1 day')::date);
    if d < p_from then
      d := make_date(extract(year from p_from)::int, extract(month from p_from)::int, 1) + interval '1 month';
      d := least(d::date + (target_dom - 1), (d + interval '1 month - 1 day')::date);
    end if;
    return d;
  elsif p_freq = 'yearly' then
    y := extract(year from p_from)::int;
    d := make_date(y, coalesce(p_month, extract(month from p_from)::int), 1);
    d := least(d + (coalesce(p_day, extract(day from p_from)::int) - 1), (d + interval '1 month - 1 day')::date);
    if d < p_from then
      d := make_date(y + 1, coalesce(p_month, extract(month from p_from)::int), 1);
      d := least(d + (coalesce(p_day, extract(day from p_from)::int) - 1), (d + interval '1 month - 1 day')::date);
    end if;
    return d;
  end if;
  return p_from;
end;
$$;

create or replace function public.recurring_step(p_freq text)
returns interval
language sql
immutable
as $$
  select case p_freq
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'yearly' then interval '1 year'
    else null end;
$$;

-- -------------------------------------------------------------------------
-- 7. generate_recurring_occurrences: materialise occurrences up to a horizon.
--    Idempotent (unique constraint + on conflict do nothing).
-- -------------------------------------------------------------------------
create or replace function public.generate_recurring_occurrences(
  p_recurring uuid,
  p_horizon date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recurring_transactions;
  lia public.liabilities;
  horizon date := coalesce(p_horizon, current_date + interval '95 days');
  step interval;
  due date;
  last_due date;
  n int;
  bal numeric(14,2);
  mrate numeric(20,10);
  i_amt numeric(14,2);
  p_amt numeric(14,2);
begin
  select * into r from public.recurring_transactions where id = p_recurring;
  if not found or r.status <> 'active' then return; end if;
  -- Cross-user guard for direct authenticated callers; the system processor
  -- (auth.uid() is null under pg_cron) is allowed through.
  if auth.uid() is not null and r.user_id <> auth.uid() then return; end if;

  if r.kind = 'emi' and r.liability_id is not null then
    select * into lia from public.liabilities where id = r.liability_id;
    -- Build the full amortisation schedule once (bounded by installments_total).
    if lia.installments_total > 0 then
      bal := lia.original_principal;
      mrate := case when lia.interest_rate > 0 then lia.interest_rate / 1200.0 else 0 end;
      due := public.recurring_first_due(coalesce(r.start_date, lia.start_date), r.frequency,
                                        r.due_day, r.due_weekday, r.due_month);
      step := coalesce(public.recurring_step(r.frequency), interval '1 month');
      for n in 1 .. lia.installments_total loop
        if mrate > 0 then
          i_amt := round(bal * mrate, 2);
          p_amt := round(coalesce(nullif(lia.emi_amount,0), r.amount) - i_amt, 2);
        elsif coalesce(r.emi_principal,0) > 0 or coalesce(r.emi_interest,0) > 0 then
          p_amt := coalesce(r.emi_principal, 0);
          i_amt := coalesce(r.emi_interest, 0);
        else
          p_amt := round(lia.original_principal / lia.installments_total, 2);
          i_amt := 0;
        end if;
        if n = lia.installments_total then
          p_amt := greatest(0, bal);           -- last installment clears the balance
        end if;
        p_amt := least(p_amt, bal);
        insert into public.recurring_payment_occurrences (
          recurring_transaction_id, liability_id, user_id, installment_number,
          due_date, scheduled_amount, principal_amount, interest_amount
        ) values (
          r.id, r.liability_id, r.user_id, n,
          (due + step * (n - 1))::date, p_amt + i_amt, p_amt, i_amt
        )
        on conflict (recurring_transaction_id, due_date) do nothing;
        bal := round(bal - p_amt, 2);
        exit when bal <= 0.005;
      end loop;
    end if;
    update public.recurring_transactions
      set last_processed_date = current_date,
          next_run_date = coalesce((
            select min(due_date) from public.recurring_payment_occurrences
            where recurring_transaction_id = r.id and status in ('upcoming','due','overdue')
          ), r.next_run_date)
      where id = r.id;
    return;
  end if;

  -- Bill / subscription / recurring: rolling horizon.
  select max(due_date) into last_due from public.recurring_payment_occurrences
    where recurring_transaction_id = r.id;

  if r.frequency = 'one_time' then
    if last_due is null then
      due := public.recurring_first_due(coalesce(r.start_date, current_date), 'one_time', r.due_day, r.due_weekday, r.due_month);
      insert into public.recurring_payment_occurrences (
        recurring_transaction_id, user_id, due_date, scheduled_amount
      ) values (r.id, r.user_id, due, r.amount)
      on conflict (recurring_transaction_id, due_date) do nothing;
    end if;
  else
    step := public.recurring_step(r.frequency);
    if step is null then return; end if;
    if last_due is null then
      due := public.recurring_first_due(coalesce(r.start_date, current_date), r.frequency, r.due_day, r.due_weekday, r.due_month);
    else
      due := (last_due + step)::date;
    end if;
    n := 0;
    while due <= horizon and n < 240 loop
      exit when r.end_date is not null and due > r.end_date;
      insert into public.recurring_payment_occurrences (
        recurring_transaction_id, user_id, due_date, scheduled_amount
      ) values (r.id, r.user_id, due, r.amount)
      on conflict (recurring_transaction_id, due_date) do nothing;
      due := (due + step)::date;
      n := n + 1;
    end loop;
  end if;

  update public.recurring_transactions
    set last_processed_date = current_date,
        next_run_date = coalesce((
          select min(due_date) from public.recurring_payment_occurrences
          where recurring_transaction_id = r.id and status in ('upcoming','due','overdue')
        ), r.next_run_date)
    where id = r.id;
end;
$$;

grant execute on function public.generate_recurring_occurrences(uuid, date) to authenticated;

-- -------------------------------------------------------------------------
-- 8. Internal payment recorders (explicit user; used by both the public RPCs
--    and the scheduled processor). Idempotent on the occurrence + client token.
-- -------------------------------------------------------------------------
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
    transaction_id = txn_id, autopay_failed = false, updated_at = now()
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
    transaction_id = txn_id, autopay_failed = false, updated_at = now()
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

-- Public wrappers (caller = auth.uid()).
create or replace function public.record_bill_payment(
  p_occurrence uuid, p_amount numeric, p_date date default current_date,
  p_account_id uuid default null, p_category_id uuid default null,
  p_payment_method_id uuid default null, p_notes text default null,
  p_client_token uuid default null
)
returns public.recurring_payment_occurrences
language sql
security definer
set search_path = public
as $$
  select public._record_bill_payment(auth.uid(), p_occurrence, p_amount, p_date,
    p_account_id, p_category_id, p_payment_method_id, p_notes, p_client_token);
$$;

create or replace function public.record_liability_payment(
  p_occurrence uuid, p_amount numeric, p_principal numeric, p_interest numeric,
  p_date date default current_date, p_account_id uuid default null,
  p_category_id uuid default null, p_payment_method_id uuid default null,
  p_notes text default null, p_client_token uuid default null
)
returns public.recurring_payment_occurrences
language sql
security definer
set search_path = public
as $$
  select public._record_liability_payment(auth.uid(), p_occurrence, p_amount, p_principal,
    p_interest, p_date, p_account_id, p_category_id, p_payment_method_id, p_notes, p_client_token);
$$;

grant execute on function public.record_bill_payment(uuid,numeric,date,uuid,uuid,uuid,text,uuid) to authenticated;
grant execute on function public.record_liability_payment(uuid,numeric,numeric,numeric,date,uuid,uuid,uuid,text,uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 9. Skip / delete helpers.
-- -------------------------------------------------------------------------
create or replace function public.skip_recurring_occurrence(p_occurrence uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_rec uuid;
begin
  update public.recurring_payment_occurrences
    set status = 'skipped', updated_at = now()
    where id = p_occurrence and user_id = auth.uid() and status in ('upcoming','due','overdue')
    returning recurring_transaction_id into v_rec;
  if v_rec is null then raise exception 'Payment not found'; end if;
  perform public.generate_recurring_occurrences(v_rec, null);
end;
$$;

create or replace function public.delete_recurring_payment(p_recurring uuid, p_hard boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare rec public.recurring_transactions;
begin
  select * into rec from public.recurring_transactions
    where id = p_recurring and user_id = auth.uid() for update;
  if not found then raise exception 'Recurring payment not found'; end if;

  -- paid occurrences (and their transactions) are always preserved.
  update public.recurring_payment_occurrences
    set status = 'cancelled', updated_at = now()
    where recurring_transaction_id = p_recurring and status <> 'paid';

  if p_hard and not exists (
    select 1 from public.recurring_payment_occurrences
    where recurring_transaction_id = p_recurring and status = 'paid'
  ) then
    delete from public.recurring_transactions where id = p_recurring;
    if rec.liability_id is not null then
      delete from public.liabilities where id = rec.liability_id
        and not exists (select 1 from public.transactions t
                        join public.recurring_payment_occurrences o on o.transaction_id = t.id
                        where o.liability_id = rec.liability_id);
    end if;
  else
    update public.recurring_transactions
      set status = 'ended', is_active = false, updated_at = now()
      where id = p_recurring;
  end if;
end;
$$;

grant execute on function public.skip_recurring_occurrence(uuid) to authenticated;
grant execute on function public.delete_recurring_payment(uuid, boolean) to authenticated;

-- -------------------------------------------------------------------------
-- 10. The processor: status transitions, reminders, autopay. Idempotent.
--     Running it twice yields the same final state as running it once.
-- -------------------------------------------------------------------------
create or replace function public.process_recurring_for_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  o record;
  acct_balance numeric(14,2);
  days_left int;
begin
  -- 1. (re)generate occurrences for every active definition
  for r in select id from public.recurring_transactions
           where user_id = p_user and status = 'active'
  loop
    perform public.generate_recurring_occurrences(r.id, null);
  end loop;

  -- 2. status: overdue / due  (only from unpaid states; never touches paid/skipped)
  update public.recurring_payment_occurrences
    set status = 'overdue', updated_at = now()
    where user_id = p_user and status in ('upcoming','due') and due_date < current_date;
  update public.recurring_payment_occurrences
    set status = 'due', updated_at = now()
    where user_id = p_user and status = 'upcoming' and due_date = current_date;

  -- 3. reminders (one alert per event, guarded by the reminded_* flags)
  for o in
    select o.*, rt.name, rt.reminder_days_before, rt.autopay, rt.account_id, rt.kind
    from public.recurring_payment_occurrences o
    join public.recurring_transactions rt on rt.id = o.recurring_transaction_id
    where o.user_id = p_user and o.status in ('upcoming','due','overdue') and rt.status = 'active'
  loop
    days_left := o.due_date - current_date;

    if days_left < 0 and not o.reminded_overdue then
      insert into public.alerts (user_id, type, title, body, severity, related_id)
      values (p_user, 'bill_overdue', o.name || ' payment is ' || abs(days_left) ||
              ' day' || case when abs(days_left) = 1 then '' else 's' end || ' overdue',
              to_char(o.scheduled_amount, 'FM999999990D00'), 'warning', o.id);
      update public.recurring_payment_occurrences set reminded_overdue = true where id = o.id;

    elsif days_left = 0 and not o.reminded_due then
      insert into public.alerts (user_id, type, title, body, severity, related_id)
      values (p_user, 'bill_due', o.name || ' payment is due today',
              to_char(o.scheduled_amount, 'FM999999990D00'), 'info', o.id);
      update public.recurring_payment_occurrences set reminded_due = true where id = o.id;

    elsif days_left > 0 and days_left <= greatest(o.reminder_days_before, 0)
          and not o.reminded_upcoming then
      insert into public.alerts (user_id, type, title, body, severity, related_id)
      values (p_user, 'bill_due', o.name || ' payment due in ' || days_left ||
              ' day' || case when days_left = 1 then '' else 's' end,
              to_char(o.scheduled_amount, 'FM999999990D00'), 'info', o.id);
      update public.recurring_payment_occurrences set reminded_upcoming = true where id = o.id;
    end if;
  end loop;

  -- 4. autopay (idempotent: client_token = occurrence id; already-paid -> no-op)
  for o in
    select o.*, rt.account_id as rt_account, rt.kind as rt_kind
    from public.recurring_payment_occurrences o
    join public.recurring_transactions rt on rt.id = o.recurring_transaction_id
    where o.user_id = p_user and rt.status = 'active' and rt.autopay
      and o.status in ('due','overdue') and o.due_date <= current_date
  loop
    if o.rt_account is null then
      continue;
    end if;
    select current_balance into acct_balance from public.accounts
      where id = o.rt_account and user_id = p_user;
    if acct_balance is null or acct_balance < o.scheduled_amount then
      if not o.autopay_failed then
        update public.recurring_payment_occurrences set autopay_failed = true where id = o.id;
        insert into public.alerts (user_id, type, title, body, severity, related_id)
        values (p_user, 'payment_failed', 'Autopay failed for ' ||
                (select name from public.recurring_transactions where id = o.recurring_transaction_id),
                'Not enough balance in the linked account.', 'danger', o.id);
      end if;
      continue;
    end if;

    if o.rt_kind = 'emi' then
      perform public._record_liability_payment(p_user, o.id, o.scheduled_amount,
        o.principal_amount, o.interest_amount, current_date, o.rt_account, null, null,
        'Autopay', o.id);
    else
      perform public._record_bill_payment(p_user, o.id, o.scheduled_amount, current_date,
        o.rt_account,
        (select category_id from public.recurring_transactions where id = o.recurring_transaction_id),
        null, 'Autopay', o.id);
    end if;
  end loop;
end;
$$;

create or replace function public.process_my_recurring()
returns void
language sql
security definer
set search_path = public
as $$
  select public.process_recurring_for_user(auth.uid());
$$;

create or replace function public.process_all_recurring()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare u uuid;
begin
  for u in select distinct user_id from public.recurring_transactions where status = 'active'
  loop
    perform public.process_recurring_for_user(u);
  end loop;
end;
$$;

grant execute on function public.process_my_recurring() to authenticated;

-- Internal helpers must NOT be callable directly by API roles (they take an
-- explicit p_user and run as SECURITY DEFINER). The public wrappers above are
-- the only supported entry points.
revoke execute on function public._record_bill_payment(uuid,uuid,numeric,date,uuid,uuid,uuid,text,uuid) from anon, authenticated, public;
revoke execute on function public._record_liability_payment(uuid,uuid,numeric,numeric,numeric,date,uuid,uuid,uuid,text,uuid) from anon, authenticated, public;
revoke execute on function public.process_recurring_for_user(uuid) from anon, authenticated, public;
revoke execute on function public.process_all_recurring() from anon, authenticated, public;

-- -------------------------------------------------------------------------
-- 11. Summary RPCs for the Bills page + dashboard widget.
-- -------------------------------------------------------------------------
create or replace function public.get_bills_summary()
returns table (
  upcoming_amount numeric,
  due_this_month_amount numeric,
  overdue_amount numeric,
  active_count int,
  overdue_count int
)
language sql
stable
security definer
set search_path = public
as $$
  with occ as (
    select * from public.recurring_payment_occurrences
    where user_id = auth.uid() and status in ('upcoming','due','overdue')
  )
  select
    coalesce(sum(scheduled_amount - paid_amount) filter (where status in ('upcoming','due')), 0),
    coalesce(sum(scheduled_amount - paid_amount) filter (
      where due_date >= date_trunc('month', current_date)::date
        and due_date < (date_trunc('month', current_date) + interval '1 month')::date), 0),
    coalesce(sum(scheduled_amount - paid_amount) filter (where status = 'overdue'), 0),
    (select count(*)::int from public.recurring_transactions
      where user_id = auth.uid() and status = 'active'),
    coalesce(count(*) filter (where status = 'overdue'), 0)::int
  from occ;
$$;

grant execute on function public.get_bills_summary() to authenticated;

-- -------------------------------------------------------------------------
-- 12. Extend the financial-summary RPCs, ADDITIVELY, for loan liabilities.
--     Bills/subscriptions need no change (they are plain expense txns).
-- -------------------------------------------------------------------------
drop function if exists public.get_financial_summary();
create or replace function public.get_financial_summary()
returns table (
  available_balance numeric, bank_balance numeric, cash_balance numeric,
  wallet_balance numeric, other_asset_balance numeric, credit_card_debt numeric,
  credit_limit numeric, available_credit numeric, credit_utilization numeric,
  money_lent numeric, receivable_outstanding numeric, principal_received numeric,
  interest_received numeric, overdue_amount numeric, borrower_count int,
  loan_liabilities numeric, net_worth numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with acct as (
    select public.account_financial_type(type) as fin_type, current_balance,
      coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0) as outstanding,
      coalesce(nullif(metadata->>'credit_limit','')::numeric, 0) as climit
    from public.accounts where user_id = auth.uid() and is_active
  ),
  a as (
    select
      coalesce(sum(current_balance) filter (where fin_type <> 'liability'), 0) as available_balance,
      coalesce(sum(current_balance) filter (where fin_type = 'bank_asset'), 0) as bank_balance,
      coalesce(sum(current_balance) filter (where fin_type = 'cash_asset'), 0) as cash_balance,
      coalesce(sum(current_balance) filter (where fin_type = 'wallet_asset'), 0) as wallet_balance,
      coalesce(sum(current_balance) filter (where fin_type = 'other_asset'), 0) as other_asset_balance,
      coalesce(sum(outstanding) filter (where fin_type = 'liability'), 0) as credit_card_debt,
      coalesce(sum(climit) filter (where fin_type = 'liability'), 0) as credit_limit
    from acct
  ),
  l as (
    select
      coalesce(sum(principal_amount), 0) as money_lent,
      coalesce(sum(outstanding_principal + outstanding_interest), 0) as receivable_outstanding,
      coalesce(sum(principal_received), 0) as principal_received,
      coalesce(sum(interest_received), 0) as interest_received,
      coalesce(sum(outstanding_principal + outstanding_interest) filter (where status = 'overdue'), 0) as overdue_amount,
      count(distinct borrower_name)::int as borrower_count
    from public.lending_records
    where user_id = auth.uid() and status not in ('cancelled','written_off')
  ),
  liab as (
    select coalesce(sum(outstanding_principal), 0) as loan_liabilities
    from public.liabilities where user_id = auth.uid() and status = 'active'
  )
  select
    a.available_balance, a.bank_balance, a.cash_balance, a.wallet_balance, a.other_asset_balance,
    a.credit_card_debt, a.credit_limit,
    greatest(0, a.credit_limit - a.credit_card_debt) as available_credit,
    case when a.credit_limit > 0 then round((a.credit_card_debt / a.credit_limit) * 100, 1) else 0 end as credit_utilization,
    l.money_lent, l.receivable_outstanding, l.principal_received, l.interest_received,
    l.overdue_amount, l.borrower_count,
    liab.loan_liabilities,
    (a.available_balance + l.receivable_outstanding - a.credit_card_debt - liab.loan_liabilities) as net_worth
  from a, l, liab;
$$;

grant execute on function public.get_financial_summary() to authenticated;

drop function if exists public.get_monthly_financial_summary(int,int);
create or replace function public.get_monthly_financial_summary(p_year int, p_month int)
returns table (
  income numeric, expenses numeric, money_lent numeric, principal_received numeric,
  interest_received numeric, net_operating_savings numeric, cash_flow numeric,
  savings_rate numeric, loan_principal_paid numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with period as (
    select make_date(p_year, p_month, 1) as start_date,
           (make_date(p_year, p_month, 1) + interval '1 month')::date as end_date
  ),
  tx as (
    select
      coalesce(sum(amount) filter (where type = 'income'), 0) as income,
      coalesce(sum(amount) filter (where type = 'expense'), 0) as expenses
    from public.transactions, period
    where user_id = auth.uid()
      and transaction_date >= period.start_date and transaction_date < period.end_date
  ),
  lent as (
    select coalesce(sum(principal_amount), 0) as money_lent
    from public.lending_records, period
    where user_id = auth.uid()
      and lending_date >= period.start_date and lending_date < period.end_date
  ),
  repaid as (
    select
      coalesce(sum(principal_amount), 0) as principal_received,
      coalesce(sum(interest_amount), 0) as interest_received
    from public.lending_repayments, period
    where user_id = auth.uid()
      and payment_date >= period.start_date and payment_date < period.end_date
  ),
  loanp as (
    select coalesce(sum(o.principal_amount), 0) as loan_principal_paid
    from public.recurring_payment_occurrences o, period
    where o.user_id = auth.uid() and o.status = 'paid'
      and o.paid_at >= period.start_date and o.paid_at < period.end_date
  )
  select
    tx.income, tx.expenses, lent.money_lent, repaid.principal_received, repaid.interest_received,
    (tx.income - tx.expenses) as net_operating_savings,
    (tx.income - tx.expenses - lent.money_lent + repaid.principal_received - loanp.loan_principal_paid) as cash_flow,
    case when tx.income > 0 then round(((tx.income - tx.expenses) / tx.income) * 100, 1) else 0 end as savings_rate,
    loanp.loan_principal_paid
  from tx, lent, repaid, loanp;
$$;

grant execute on function public.get_monthly_financial_summary(int,int) to authenticated;

-- -------------------------------------------------------------------------
-- 13. Realtime
-- -------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.recurring_payment_occurrences;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.liabilities;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.recurring_transactions;
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------------------
-- 14. Daily scheduled processor via pg_cron.
--     Needs the pg_cron extension. On Supabase enable it once under
--     Database -> Extensions (or it is created here if privileges allow).
-- -------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not enabled automatically (%). Enable it in the Supabase dashboard, then run the cron.schedule call from this migration.', sqlerrm;
end $$;

do $$
begin
  perform cron.unschedule('moneyflow-process-recurring');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('moneyflow-process-recurring', '30 1 * * *',
    $cron$ select public.process_all_recurring(); $cron$);
exception when others then
  raise notice 'Could not schedule cron job (%). After enabling pg_cron, run: select cron.schedule(''moneyflow-process-recurring'', ''30 1 * * *'', ''select public.process_all_recurring();'');', sqlerrm;
end $$;

notify pgrst, 'reload schema';
