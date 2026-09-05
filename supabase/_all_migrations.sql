
-- ============================================================
-- migrations/001_create_profiles.sql
-- ============================================================
-- 001_create_profiles.sql
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- migrations/002_create_accounts.sql
-- ============================================================
-- 002_create_accounts.sql
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'Bank Account',
  opening_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  currency text not null default 'INR',
  institution text,
  last_four_digits text,
  icon text,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- migrations/003_create_categories.sql
-- ============================================================
-- 003_create_categories.sql
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income','expense')),
  parent_id uuid references public.categories(id) on delete set null,
  icon text,
  color text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default categories + payment methods for a user.
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


-- ============================================================
-- migrations/004_create_transactions.sql
-- ============================================================
-- 004_create_transactions.sql
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  transaction_date date not null default current_date,
  notes text,
  attachment_url text,
  -- Links a transaction to a lending repayment so we never double count cash.
  source text not null default 'manual' check (source in ('manual','lending_interest')),
  lending_repayment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly')),
  next_run_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep account.current_balance in sync with manual transactions.
create or replace function public.apply_transaction_balance()
returns trigger
language plpgsql
as $$
declare
  delta numeric(14,2);
begin
  if tg_op = 'INSERT' then
    if new.account_id is not null then
      delta := case when new.type = 'income' then new.amount else -new.amount end;
      update public.accounts set current_balance = current_balance + delta, updated_at = now()
        where id = new.account_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.account_id is not null then
      delta := case when old.type = 'income' then -old.amount else old.amount end;
      update public.accounts set current_balance = current_balance + delta, updated_at = now()
        where id = old.account_id;
    end if;
    return old;
  else
    if old.account_id is not null then
      update public.accounts set current_balance = current_balance +
        case when old.type = 'income' then -old.amount else old.amount end, updated_at = now()
        where id = old.account_id;
    end if;
    if new.account_id is not null then
      update public.accounts set current_balance = current_balance +
        case when new.type = 'income' then new.amount else -new.amount end, updated_at = now()
        where id = new.account_id;
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_transaction_balance on public.transactions;
create trigger trg_transaction_balance
  after insert or update or delete on public.transactions
  for each row execute function public.apply_transaction_balance();


-- ============================================================
-- migrations/005_create_budgets.sql
-- ============================================================
-- 005_create_budgets.sql
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month, year)
);


-- ============================================================
-- migrations/006_create_goals.sql
-- ============================================================
-- 006_create_goals.sql
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0,
  target_date date,
  category text,
  description text,
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount <> 0),
  contribution_date date not null default current_date,
  account_id uuid references public.accounts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.apply_goal_contribution()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.savings_goals
      set current_amount = greatest(0, current_amount + new.amount), updated_at = now()
      where id = new.goal_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.savings_goals
      set current_amount = greatest(0, current_amount - old.amount), updated_at = now()
      where id = old.goal_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_goal_contribution on public.goal_contributions;
create trigger trg_goal_contribution
  after insert or delete on public.goal_contributions
  for each row execute function public.apply_goal_contribution();


-- ============================================================
-- migrations/007_create_lending.sql
-- ============================================================
-- 007_create_lending.sql
create table if not exists public.lending_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  borrower_name text not null,
  phone text,
  email text,
  address text,
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  interest_type text not null default 'none' check (interest_type in ('none','fixed','percentage','simple')),
  interest_rate numeric(9,4) not null default 0 check (interest_rate >= 0),
  interest_amount numeric(14,2) not null default 0 check (interest_amount >= 0),
  total_expected_amount numeric(14,2) not null default 0,
  amount_received numeric(14,2) not null default 0,
  principal_received numeric(14,2) not null default 0,
  interest_received numeric(14,2) not null default 0,
  outstanding_principal numeric(14,2) not null default 0,
  outstanding_interest numeric(14,2) not null default 0,
  lending_date date not null default current_date,
  due_date date,
  payment_frequency text default 'one_time' check (payment_frequency in ('one_time','monthly','yearly','weekly')),
  purpose text,
  status text not null default 'active'
    check (status in ('active','partially_paid','fully_paid','overdue','cancelled','written_off')),
  account_id uuid references public.accounts(id) on delete set null,
  notes text,
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= lending_date)
);

-- Compute derived interest + expected totals + outstanding on write.
create or replace function public.lending_recalc()
returns trigger
language plpgsql
as $$
declare
  computed_interest numeric(14,2);
begin
  computed_interest := case new.interest_type
    when 'none' then 0
    when 'fixed' then new.interest_amount
    when 'percentage' then round(new.principal_amount * new.interest_rate / 100, 2)
    when 'simple' then round(new.principal_amount * new.interest_rate / 100, 2)
    else new.interest_amount end;

  new.interest_amount := computed_interest;
  new.total_expected_amount := new.principal_amount + computed_interest;
  new.outstanding_principal := greatest(0, new.principal_amount - new.principal_received);
  new.outstanding_interest := greatest(0, computed_interest - new.interest_received);
  new.amount_received := new.principal_received + new.interest_received;

  if new.status not in ('cancelled','written_off') then
    if new.outstanding_principal + new.outstanding_interest <= 0 then
      new.status := 'fully_paid';
    elsif new.due_date is not null and new.due_date < current_date then
      new.status := 'overdue';
    elsif new.principal_received + new.interest_received > 0 then
      new.status := 'partially_paid';
    else
      new.status := 'active';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lending_recalc on public.lending_records;
create trigger trg_lending_recalc
  before insert or update on public.lending_records
  for each row execute function public.lending_recalc();

-- Decrease cash when money is lent; restore it if the record is deleted.
create or replace function public.lending_cash_out()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.account_id is not null then
      update public.accounts set current_balance = current_balance - new.principal_amount, updated_at = now()
        where id = new.account_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.account_id is not null then
      update public.accounts set current_balance = current_balance + old.principal_amount, updated_at = now()
        where id = old.account_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_lending_cash_out on public.lending_records;
create trigger trg_lending_cash_out
  after insert or delete on public.lending_records
  for each row execute function public.lending_cash_out();


-- ============================================================
-- migrations/008_create_repayments.sql
-- ============================================================
-- 008_create_repayments.sql
create table if not exists public.lending_repayments (
  id uuid primary key default gen_random_uuid(),
  lending_record_id uuid not null references public.lending_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  principal_amount numeric(14,2) not null default 0 check (principal_amount >= 0),
  interest_amount numeric(14,2) not null default 0 check (interest_amount >= 0),
  payment_date date not null default current_date,
  account_id uuid references public.accounts(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  notes text,
  attachment_url text,
  created_at timestamptz not null default now(),
  check (principal_amount + interest_amount = amount)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  severity text not null default 'info' check (severity in ('info','warning','danger','success')),
  related_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  path text not null,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- Atomic repayment: validate, insert, update lending totals, adjust cash,
-- and record interest as income exactly once.
create or replace function public.record_lending_repayment(
  p_lending_record_id uuid,
  p_amount numeric,
  p_principal numeric,
  p_interest numeric,
  p_payment_date date,
  p_account_id uuid default null,
  p_payment_method_id uuid default null,
  p_notes text default null,
  p_attachment_url text default null
)
returns public.lending_repayments
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.lending_records;
  repayment public.lending_repayments;
  interest_category uuid;
begin
  select * into rec from public.lending_records
    where id = p_lending_record_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'Lending record not found';
  end if;

  if p_principal < 0 or p_interest < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  if round(p_principal + p_interest, 2) <> round(p_amount, 2) then
    raise exception 'Principal + interest must equal the repayment amount';
  end if;
  if p_principal > rec.outstanding_principal + 0.001 then
    raise exception 'Principal repayment exceeds outstanding principal';
  end if;
  if p_interest > rec.outstanding_interest + 0.001 then
    raise exception 'Interest repayment exceeds outstanding interest';
  end if;

  insert into public.lending_repayments (
    lending_record_id, user_id, amount, principal_amount, interest_amount,
    payment_date, account_id, payment_method_id, notes, attachment_url
  ) values (
    p_lending_record_id, auth.uid(), p_amount, p_principal, p_interest,
    p_payment_date, p_account_id, p_payment_method_id, p_notes, p_attachment_url
  ) returning * into repayment;

  update public.lending_records set
    principal_received = principal_received + p_principal,
    interest_received = interest_received + p_interest
  where id = p_lending_record_id;

  -- Cash in: principal + interest both increase the account balance.
  if p_account_id is not null then
    update public.accounts set current_balance = current_balance + p_amount, updated_at = now()
      where id = p_account_id and user_id = auth.uid();
  end if;

  -- Interest portion is income. Insert with source flag; the balance trigger
  -- is skipped for this row to avoid double counting (account already credited).
  if p_interest > 0 then
    select id into interest_category from public.categories
      where user_id = auth.uid() and type = 'income' and name = 'Interest' limit 1;
    insert into public.transactions (
      user_id, account_id, category_id, payment_method_id, type, amount,
      description, transaction_date, source, lending_repayment_id
    ) values (
      auth.uid(), null, interest_category, p_payment_method_id, 'income', p_interest,
      'Interest from ' || rec.borrower_name, p_payment_date, 'lending_interest', repayment.id
    );
  end if;

  return repayment;
end;
$$;


-- ============================================================
-- migrations/009_create_indexes.sql
-- ============================================================
-- 009_create_indexes.sql
create index if not exists idx_tx_user_date on public.transactions (user_id, transaction_date desc);
create index if not exists idx_tx_user_type on public.transactions (user_id, type);
create index if not exists idx_tx_user_category on public.transactions (user_id, category_id);
create index if not exists idx_tx_user_account on public.transactions (user_id, account_id);

create index if not exists idx_budgets_user_period on public.budgets (user_id, year, month);
create index if not exists idx_categories_user_type on public.categories (user_id, type);
create index if not exists idx_accounts_user on public.accounts (user_id, is_active);

create index if not exists idx_lending_user_status on public.lending_records (user_id, status);
create index if not exists idx_lending_user_due on public.lending_records (user_id, due_date);
create index if not exists idx_repayments_record_date on public.lending_repayments (lending_record_id, payment_date desc);
create index if not exists idx_repayments_user on public.lending_repayments (user_id, payment_date desc);

create index if not exists idx_goal_contrib_goal on public.goal_contributions (goal_id, contribution_date desc);
create index if not exists idx_alerts_user_read on public.alerts (user_id, is_read, created_at desc);


-- ============================================================
-- migrations/010_create_functions.sql
-- ============================================================
-- 010_create_functions.sql
-- Monthly financial summary keeping each concept separate (see spec §93/§94).
create or replace function public.get_monthly_financial_summary(p_year int, p_month int)
returns table (
  income numeric,
  expenses numeric,
  money_lent numeric,
  principal_received numeric,
  interest_received numeric,
  net_operating_savings numeric,
  cash_flow numeric,
  savings_rate numeric
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
      and transaction_date >= period.start_date
      and transaction_date < period.end_date
  ),
  lent as (
    select coalesce(sum(principal_amount), 0) as money_lent
    from public.lending_records, period
    where user_id = auth.uid()
      and lending_date >= period.start_date
      and lending_date < period.end_date
  ),
  repaid as (
    select
      coalesce(sum(principal_amount), 0) as principal_received,
      coalesce(sum(interest_amount), 0) as interest_received
    from public.lending_repayments, period
    where user_id = auth.uid()
      and payment_date >= period.start_date
      and payment_date < period.end_date
  )
  select
    tx.income,
    tx.expenses,
    lent.money_lent,
    repaid.principal_received,
    repaid.interest_received,
    (tx.income - tx.expenses) as net_operating_savings,
    (tx.income - tx.expenses - lent.money_lent + repaid.principal_received + repaid.interest_received) as cash_flow,
    case when tx.income > 0 then round(((tx.income - tx.expenses) / tx.income) * 100, 1) else 0 end as savings_rate
  from tx, lent, repaid;
$$;

-- Lending portfolio summary.
create or replace function public.get_lending_summary()
returns table (
  total_lent numeric,
  outstanding numeric,
  received numeric,
  interest_earned numeric,
  overdue numeric,
  borrower_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(principal_amount), 0),
    coalesce(sum(outstanding_principal + outstanding_interest), 0),
    coalesce(sum(principal_received + interest_received), 0),
    coalesce(sum(interest_received), 0),
    coalesce(sum(outstanding_principal + outstanding_interest) filter (where status = 'overdue'), 0),
    count(distinct borrower_name)::int
  from public.lending_records
  where user_id = auth.uid() and status not in ('cancelled','written_off');
$$;

-- Category expense breakdown for a date range.
create or replace function public.get_category_expense_summary(p_from date, p_to date)
returns table (category_id uuid, category_name text, color text, total numeric)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.color, coalesce(sum(t.amount), 0) as total
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid() and t.type = 'expense'
    and t.transaction_date >= p_from and t.transaction_date <= p_to
  group by c.id, c.name, c.color
  order by total desc;
$$;

-- Recompute an account balance from scratch (repair helper).
create or replace function public.recalculate_account_balance(p_account_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  base numeric(14,2);
  tx_delta numeric(14,2);
  lent_delta numeric(14,2);
  repaid_delta numeric(14,2);
  result numeric(14,2);
begin
  select opening_balance into base from public.accounts
    where id = p_account_id and user_id = auth.uid();
  if not found then raise exception 'Account not found'; end if;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into tx_delta from public.transactions
    where account_id = p_account_id and user_id = auth.uid();

  select coalesce(sum(principal_amount), 0) into lent_delta
    from public.lending_records where account_id = p_account_id and user_id = auth.uid();

  select coalesce(sum(amount), 0) into repaid_delta
    from public.lending_repayments where account_id = p_account_id and user_id = auth.uid();

  result := base + tx_delta - lent_delta + repaid_delta;
  update public.accounts set current_balance = result, updated_at = now()
    where id = p_account_id;
  return result;
end;
$$;

-- Views
create or replace view public.borrower_summary as
  select
    user_id,
    borrower_name,
    count(*) as record_count,
    sum(principal_amount) as total_lent,
    sum(principal_received + interest_received) as total_received,
    sum(outstanding_principal + outstanding_interest) as outstanding,
    min(due_date) filter (where outstanding_principal + outstanding_interest > 0) as next_due_date
  from public.lending_records
  group by user_id, borrower_name;

create or replace view public.account_balance_summary as
  select user_id, sum(current_balance) as total_balance, count(*) as account_count
  from public.accounts where is_active group by user_id;


-- ============================================================
-- migrations/011_create_rls.sql
-- ============================================================
-- 011_create_rls.sql
-- Enable RLS + owner-only policies on every user-owned table.

alter view public.borrower_summary set (security_invoker = on);
alter view public.account_balance_summary set (security_invoker = on);

do $$
declare
  t text;
  owned_tables text[] := array[
    'accounts','categories','payment_methods','transactions','recurring_transactions',
    'budgets','savings_goals','goal_contributions','lending_records','lending_repayments',
    'alerts','attachments'
  ];
begin
  foreach t in array owned_tables loop
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
end;
$$;

-- profiles: a user may only see and edit their own profile.
alter table public.profiles enable row level security;
drop policy if exists "profile_select" on public.profiles;
drop policy if exists "profile_update" on public.profiles;
drop policy if exists "profile_insert" on public.profiles;
create policy "profile_select" on public.profiles for select using (id = auth.uid());
create policy "profile_update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profile_insert" on public.profiles for insert with check (id = auth.uid());

-- Let an authenticated user seed their own defaults exactly once.
create or replace function public.ensure_user_setup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (auth.uid(), auth.jwt() ->> 'email')
    on conflict (id) do nothing;
  if not exists (select 1 from public.categories where user_id = auth.uid()) then
    perform public.seed_user_defaults(auth.uid());
  end if;
end;
$$;

grant execute on function public.ensure_user_setup() to authenticated;
grant execute on function public.record_lending_repayment(uuid,numeric,numeric,numeric,date,uuid,uuid,text,text) to authenticated;
grant execute on function public.get_monthly_financial_summary(int,int) to authenticated;
grant execute on function public.get_lending_summary() to authenticated;
grant execute on function public.get_category_expense_summary(date,date) to authenticated;
grant execute on function public.recalculate_account_balance(uuid) to authenticated;


-- ============================================================
-- migrations/012_storage.sql
-- ============================================================
-- 012_storage.sql
insert into storage.buckets (id, name, public)
values ('avatars','avatars',false), ('attachments','attachments',false), ('lending-documents','lending-documents',false)
on conflict (id) do nothing;

-- Users can only touch files under a top-level folder named after their uid.
do $$
declare b text;
begin
  foreach b in array array['avatars','attachments','lending-documents'] loop
    execute format($p$drop policy if exists "%1$s_rw" on storage.objects$p$, b);
    execute format($p$
      create policy "%1$s_rw" on storage.objects for all
      using (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)
    $p$, b);
  end loop;
end;
$$;


-- ============================================================
-- migrations/013_lending_repayment_delete.sql
-- ============================================================
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


-- ============================================================
-- migrations/014_realtime.sql
-- ============================================================
-- 014_realtime.sql
-- Expose a small set of user-owned tables to Supabase Realtime.
-- RLS still applies to the stream, so users only receive their own row changes.
do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lending_records;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lending_repayments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.alerts;
exception when duplicate_object then null;
end $$;


-- ============================================================
-- migrations/015_grants.sql
-- ============================================================
-- 015_grants.sql
-- Base table/sequence/function privileges for the API roles.
-- RLS policies still restrict WHICH rows each user can see; these grants only
-- allow the roles to reach the tables at all.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Apply the same defaults to anything created later.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;


-- ============================================================
-- migrations/016_account_metadata.sql
-- ============================================================
-- 016_account_metadata.sql
-- Extra, non-sensitive account details for the redesigned Accounts page:
-- card network, expiry month/year, IFSC, UPI id / wallet identifier,
-- account subtype (savings/current/salary), credit limit + outstanding, notes,
-- optional bank logo url, and a card theme override. Kept in one JSONB column
-- so no schema churn and existing transaction logic is untouched.
alter table public.accounts
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Never store: full card number, CVV, PIN, OTP, banking passwords.
comment on column public.accounts.metadata is
  'Non-sensitive display details only: {network, expiry_month, expiry_year, ifsc, upi_id, identifier, subtype, credit_limit, current_outstanding, notes, bank_logo_url, theme}';


-- ============================================================
-- migrations/017_financial_summary.sql
-- ============================================================
-- 017_financial_summary.sql
-- Single source of truth for point-in-time financial position.
-- Cleanly separates: available cash · credit-card debt · receivables · net worth.

-- ---------------------------------------------------------------------------
-- Account financial classification (one definition, used everywhere).
-- ---------------------------------------------------------------------------
create or replace function public.account_financial_type(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'Cash' then 'cash_asset'
    when 'Bank Account' then 'bank_asset'
    when 'UPI Wallet' then 'wallet_asset'
    when 'Digital Wallet' then 'wallet_asset'
    when 'Debit Card' then 'cash_asset'
    when 'Credit Card' then 'liability'
    else 'other_asset'
  end;
$$;

-- Whether an account contributes to "available balance" (all assets, not the
-- credit-card liability).
create or replace function public.is_available_cash_account(p_type text)
returns boolean
language sql
immutable
as $$
  select public.account_financial_type(p_type) <> 'liability';
$$;

-- ---------------------------------------------------------------------------
-- Guard: a transaction linked to a Credit Card account must NOT move
-- current_balance (credit cards are tracked via metadata debt, not cash logic).
-- ---------------------------------------------------------------------------
create or replace function public.apply_transaction_balance()
returns trigger
language plpgsql
as $$
declare
  old_ok boolean := false;
  new_ok boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.account_id is not null then
    select public.is_available_cash_account(type) into old_ok from public.accounts where id = old.account_id;
  end if;
  if tg_op in ('UPDATE', 'INSERT') and new.account_id is not null then
    select public.is_available_cash_account(type) into new_ok from public.accounts where id = new.account_id;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new_ok, false) then
      update public.accounts
        set current_balance = current_balance + case when new.type = 'income' then new.amount else -new.amount end,
            updated_at = now()
        where id = new.account_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if coalesce(old_ok, false) then
      update public.accounts
        set current_balance = current_balance + case when old.type = 'income' then -old.amount else old.amount end,
            updated_at = now()
        where id = old.account_id;
    end if;
    return old;
  else
    if coalesce(old_ok, false) then
      update public.accounts
        set current_balance = current_balance + case when old.type = 'income' then -old.amount else old.amount end,
            updated_at = now()
        where id = old.account_id;
    end if;
    if coalesce(new_ok, false) then
      update public.accounts
        set current_balance = current_balance + case when new.type = 'income' then new.amount else -new.amount end,
            updated_at = now()
        where id = new.account_id;
    end if;
    return new;
  end if;
end;
$$;

-- recalculate_account_balance: skip lending/tx cash logic for credit cards.
create or replace function public.recalculate_account_balance(p_account_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  acct public.accounts;
  tx_delta numeric(14,2);
  lent_delta numeric(14,2);
  repaid_delta numeric(14,2);
  result numeric(14,2);
begin
  select * into acct from public.accounts
    where id = p_account_id and user_id = auth.uid();
  if not found then raise exception 'Account not found'; end if;

  -- Credit cards are not cash accounts: leave current_balance at its opening value.
  if not public.is_available_cash_account(acct.type) then
    update public.accounts set current_balance = acct.opening_balance, updated_at = now()
      where id = p_account_id;
    return acct.opening_balance;
  end if;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into tx_delta from public.transactions
    where account_id = p_account_id and user_id = auth.uid();

  select coalesce(sum(principal_amount), 0) into lent_delta
    from public.lending_records where account_id = p_account_id and user_id = auth.uid();

  select coalesce(sum(amount), 0) into repaid_delta
    from public.lending_repayments where account_id = p_account_id and user_id = auth.uid();

  result := acct.opening_balance + tx_delta - lent_delta + repaid_delta;
  update public.accounts set current_balance = result, updated_at = now()
    where id = p_account_id;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_financial_summary: the one function the Dashboard AND Accounts page use.
-- ---------------------------------------------------------------------------
create or replace function public.get_financial_summary()
returns table (
  available_balance numeric,
  bank_balance numeric,
  cash_balance numeric,
  wallet_balance numeric,
  other_asset_balance numeric,
  credit_card_debt numeric,
  credit_limit numeric,
  available_credit numeric,
  credit_utilization numeric,
  money_lent numeric,
  receivable_outstanding numeric,
  principal_received numeric,
  interest_received numeric,
  overdue_amount numeric,
  borrower_count int,
  net_worth numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with acct as (
    select
      public.account_financial_type(type) as fin_type,
      current_balance,
      coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0) as outstanding,
      coalesce(nullif(metadata->>'credit_limit','')::numeric, 0) as climit
    from public.accounts
    where user_id = auth.uid() and is_active
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
  )
  select
    a.available_balance,
    a.bank_balance,
    a.cash_balance,
    a.wallet_balance,
    a.other_asset_balance,
    a.credit_card_debt,
    a.credit_limit,
    greatest(0, a.credit_limit - a.credit_card_debt) as available_credit,
    case when a.credit_limit > 0
      then round((a.credit_card_debt / a.credit_limit) * 100, 1) else 0 end as credit_utilization,
    l.money_lent,
    l.receivable_outstanding,
    l.principal_received,
    l.interest_received,
    l.overdue_amount,
    l.borrower_count,
    (a.available_balance + l.receivable_outstanding - a.credit_card_debt) as net_worth
  from a, l;
$$;

grant execute on function public.get_financial_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Fix get_monthly_financial_summary: lending interest is already counted in
-- `income` (it is a real income transaction), so cash_flow must NOT add
-- interest_received again. Only principal_received is a cash inflow not already
-- represented as a transaction.
-- ---------------------------------------------------------------------------
create or replace function public.get_monthly_financial_summary(p_year int, p_month int)
returns table (
  income numeric,
  expenses numeric,
  money_lent numeric,
  principal_received numeric,
  interest_received numeric,
  net_operating_savings numeric,
  cash_flow numeric,
  savings_rate numeric
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
      and transaction_date >= period.start_date
      and transaction_date < period.end_date
  ),
  lent as (
    select coalesce(sum(principal_amount), 0) as money_lent
    from public.lending_records, period
    where user_id = auth.uid()
      and lending_date >= period.start_date
      and lending_date < period.end_date
  ),
  repaid as (
    select
      coalesce(sum(principal_amount), 0) as principal_received,
      coalesce(sum(interest_amount), 0) as interest_received
    from public.lending_repayments, period
    where user_id = auth.uid()
      and payment_date >= period.start_date
      and payment_date < period.end_date
  )
  select
    tx.income,
    tx.expenses,
    lent.money_lent,
    repaid.principal_received,
    repaid.interest_received,
    (tx.income - tx.expenses) as net_operating_savings,
    (tx.income - tx.expenses - lent.money_lent + repaid.principal_received) as cash_flow,
    case when tx.income > 0 then round(((tx.income - tx.expenses) / tx.income) * 100, 1) else 0 end as savings_rate
  from tx, lent, repaid;
$$;

grant execute on function public.get_monthly_financial_summary(int,int) to authenticated;
grant execute on function public.account_financial_type(text) to authenticated, anon;
grant execute on function public.is_available_cash_account(text) to authenticated, anon;

-- Keep the legacy view financially honest (available balance, not asset+liability mix).
-- Dropped first because create-or-replace cannot rename an existing view column.
drop view if exists public.account_balance_summary;
create view public.account_balance_summary as
  select
    user_id,
    sum(current_balance) filter (where public.is_available_cash_account(type)) as available_balance,
    count(*) as account_count
  from public.accounts
  where is_active
  group by user_id;
alter view public.account_balance_summary set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Optional idempotency for repayments: callers may pass a client token; a
-- retry with the same token returns the existing repayment instead of
-- duplicating cash + income.
-- ---------------------------------------------------------------------------
alter table public.lending_repayments
  add column if not exists client_token uuid;
create unique index if not exists uq_lending_repayments_client_token
  on public.lending_repayments (user_id, client_token)
  where client_token is not null;

-- Replace the 9-arg version with a 10-arg version (adds p_client_token).
drop function if exists public.record_lending_repayment(uuid,numeric,numeric,numeric,date,uuid,uuid,text,text);

create or replace function public.record_lending_repayment(
  p_lending_record_id uuid,
  p_amount numeric,
  p_principal numeric,
  p_interest numeric,
  p_payment_date date,
  p_account_id uuid default null,
  p_payment_method_id uuid default null,
  p_notes text default null,
  p_attachment_url text default null,
  p_client_token uuid default null
)
returns public.lending_repayments
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.lending_records;
  repayment public.lending_repayments;
  interest_category uuid;
begin
  -- Idempotency: a retried call with the same token is a no-op.
  if p_client_token is not null then
    select * into repayment from public.lending_repayments
      where user_id = auth.uid() and client_token = p_client_token;
    if found then
      return repayment;
    end if;
  end if;

  select * into rec from public.lending_records
    where id = p_lending_record_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'Lending record not found';
  end if;

  if p_principal < 0 or p_interest < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  if round(p_principal + p_interest, 2) <> round(p_amount, 2) then
    raise exception 'Principal + interest must equal the repayment amount';
  end if;
  if p_principal > rec.outstanding_principal + 0.001 then
    raise exception 'Principal repayment exceeds outstanding principal';
  end if;
  if p_interest > rec.outstanding_interest + 0.001 then
    raise exception 'Interest repayment exceeds outstanding interest';
  end if;

  insert into public.lending_repayments (
    lending_record_id, user_id, amount, principal_amount, interest_amount,
    payment_date, account_id, payment_method_id, notes, attachment_url, client_token
  ) values (
    p_lending_record_id, auth.uid(), p_amount, p_principal, p_interest,
    p_payment_date, p_account_id, p_payment_method_id, p_notes, p_attachment_url, p_client_token
  ) returning * into repayment;

  update public.lending_records set
    principal_received = principal_received + p_principal,
    interest_received = interest_received + p_interest
  where id = p_lending_record_id;

  -- Cash in: principal + interest both increase the receiving account balance.
  if p_account_id is not null then
    update public.accounts set current_balance = current_balance + p_amount, updated_at = now()
      where id = p_account_id and user_id = auth.uid()
        and public.is_available_cash_account(type);
  end if;

  -- Only the interest portion is income.
  if p_interest > 0 then
    select id into interest_category from public.categories
      where user_id = auth.uid() and type = 'income' and name = 'Interest' limit 1;
    insert into public.transactions (
      user_id, account_id, category_id, payment_method_id, type, amount,
      description, transaction_date, source, lending_repayment_id
    ) values (
      auth.uid(), null, interest_category, p_payment_method_id, 'income', p_interest,
      'Interest from ' || rec.borrower_name, p_payment_date, 'lending_interest', repayment.id
    );
  end if;

  return repayment;
end;
$$;

grant execute on function public.record_lending_repayment(uuid,numeric,numeric,numeric,date,uuid,uuid,text,text,uuid) to authenticated;


-- ============================================================
-- migrations/018_lending_installment_schedule.sql
-- ============================================================
-- 018_lending_installment_schedule.sql
-- Real repayment / installment schedules for lending.
--
-- Backward compatible:
--   * lending_records / lending_repayments / record_/delete_lending_repayment keep working
--   * existing loans have schedule_generated = false  -> single-due-date behaviour unchanged
--   * a schedule is created only when the user asks for one (generate_lending_schedule)
--
-- Financial rules are UNCHANGED. This only adds a per-installment view on top of the
-- same cash / receivable / income accounting.

-- ---------------------------------------------------------------------------
-- Denormalised, schedule-aware fields on lending_records (cheap list/dashboard).
-- ---------------------------------------------------------------------------
alter table public.lending_records
  add column if not exists schedule_generated boolean not null default false,
  add column if not exists installment_frequency text,
  add column if not exists overdue_amount numeric(14,2) not null default 0,
  add column if not exists overdue_installments int not null default 0,
  add column if not exists next_due_date date,
  add column if not exists next_due_amount numeric(14,2) not null default 0;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.lending_installments (
  id uuid primary key default gen_random_uuid(),
  lending_record_id uuid not null references public.lending_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  installment_number int not null,
  due_date date not null,
  scheduled_amount numeric(14,2) not null check (scheduled_amount >= 0),
  principal_amount numeric(14,2) not null check (principal_amount >= 0),
  interest_amount numeric(14,2) not null default 0 check (interest_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  principal_paid numeric(14,2) not null default 0 check (principal_paid >= 0),
  interest_paid numeric(14,2) not null default 0 check (interest_paid >= 0),
  outstanding_amount numeric(14,2) not null default 0,
  status text not null default 'upcoming'
    check (status in ('upcoming','due','partially_paid','paid','overdue','cancelled')),
  paid_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lending_record_id, installment_number)
);

create table if not exists public.lending_repayment_allocations (
  id uuid primary key default gen_random_uuid(),
  repayment_id uuid not null references public.lending_repayments(id) on delete cascade,
  installment_id uuid not null references public.lending_installments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  principal_amount numeric(14,2) not null default 0,
  interest_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_installments_record on public.lending_installments (lending_record_id, installment_number);
create index if not exists idx_installments_user_due on public.lending_installments (user_id, due_date);
create index if not exists idx_alloc_repayment on public.lending_repayment_allocations (repayment_id);
create index if not exists idx_alloc_installment on public.lending_repayment_allocations (installment_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lending_installments','lending_repayment_allocations'] loop
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

grant select, insert, update, delete on public.lending_installments to authenticated;
grant select, insert, update, delete on public.lending_repayment_allocations to authenticated;

-- ---------------------------------------------------------------------------
-- lending_recalc(): for scheduled loans the schedule owns the status; only
-- derive the numeric fields from *_received. For non-scheduled loans keep the
-- old behaviour AND populate the denormalised overdue/next-due fields.
-- ---------------------------------------------------------------------------
create or replace function public.lending_recalc()
returns trigger
language plpgsql
as $$
declare
  computed_interest numeric(14,2);
begin
  if new.schedule_generated then
    -- Schedule is the source of truth for status + overdue/next-due; those are
    -- set by recompute_lending_from_installments(). Here we only keep the
    -- derived numeric fields coherent with *_received.
    new.outstanding_principal := greatest(0, new.principal_amount - new.principal_received);
    new.outstanding_interest := greatest(0, new.interest_amount - new.interest_received);
    new.amount_received := new.principal_received + new.interest_received;
    new.total_expected_amount := new.principal_amount + new.interest_amount;
    new.updated_at := now();
    return new;
  end if;

  computed_interest := case new.interest_type
    when 'none' then 0
    when 'fixed' then new.interest_amount
    when 'percentage' then round(new.principal_amount * new.interest_rate / 100, 2)
    when 'simple' then round(new.principal_amount * new.interest_rate / 100, 2)
    else new.interest_amount end;

  new.interest_amount := computed_interest;
  new.total_expected_amount := new.principal_amount + computed_interest;
  new.outstanding_principal := greatest(0, new.principal_amount - new.principal_received);
  new.outstanding_interest := greatest(0, computed_interest - new.interest_received);
  new.amount_received := new.principal_received + new.interest_received;

  if new.status not in ('cancelled','written_off') then
    if new.outstanding_principal + new.outstanding_interest <= 0 then
      new.status := 'fully_paid';
    elsif new.due_date is not null and new.due_date < current_date then
      new.status := 'overdue';
    elsif new.principal_received + new.interest_received > 0 then
      new.status := 'partially_paid';
    else
      new.status := 'active';
    end if;
  end if;

  -- Denormalised overdue / next-due for the single-date model.
  if new.due_date is not null and new.due_date < current_date
     and (new.outstanding_principal + new.outstanding_interest) > 0.005 then
    new.overdue_amount := new.outstanding_principal + new.outstanding_interest;
    new.overdue_installments := 1;
  else
    new.overdue_amount := 0;
    new.overdue_installments := 0;
  end if;
  new.next_due_date := case
    when (new.outstanding_principal + new.outstanding_interest) > 0.005 then new.due_date else null end;
  new.next_due_amount := case
    when new.next_due_date is not null then new.outstanding_principal + new.outstanding_interest else 0 end;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- recompute_lending_from_installments(): recompute every installment's status
-- and the loan-level rollups from the schedule. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_lending_from_installments(p_record uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  rec public.lending_records;
  v_p_paid numeric(14,2);
  v_i_paid numeric(14,2);
  v_outstanding numeric(14,2);
  v_overdue numeric(14,2);
  v_overdue_n int;
  v_next_due date;
  v_next_amt numeric(14,2);
  v_next_paid numeric(14,2);
  v_new_status text;
begin
  select user_id into owner from public.lending_records where id = p_record;
  if owner is null or owner <> auth.uid() then
    raise exception 'Lending record not found';
  end if;

  -- Per-installment status + outstanding. Only touch rows that actually change.
  update public.lending_installments i set
    outstanding_amount = greatest(0, i.scheduled_amount - i.paid_amount),
    paid_date = case when i.paid_amount >= i.scheduled_amount - 0.005 then coalesce(i.paid_date, current_date) else null end,
    status = case
      when i.status = 'cancelled' then 'cancelled'
      when i.paid_amount >= i.scheduled_amount - 0.005 then 'paid'
      when i.paid_amount > 0.005 and i.due_date < current_date then 'overdue'
      when i.paid_amount > 0.005 then 'partially_paid'
      when i.due_date < current_date then 'overdue'
      when i.due_date = current_date then 'due'
      else 'upcoming'
    end,
    updated_at = now()
  where i.lending_record_id = p_record
    and (
      i.outstanding_amount is distinct from greatest(0, i.scheduled_amount - i.paid_amount)
      or i.status is distinct from case
        when i.status = 'cancelled' then 'cancelled'
        when i.paid_amount >= i.scheduled_amount - 0.005 then 'paid'
        when i.paid_amount > 0.005 and i.due_date < current_date then 'overdue'
        when i.paid_amount > 0.005 then 'partially_paid'
        when i.due_date < current_date then 'overdue'
        when i.due_date = current_date then 'due'
        else 'upcoming'
      end
    );

  select
    coalesce(sum(principal_paid), 0),
    coalesce(sum(interest_paid), 0),
    coalesce(sum(outstanding_amount) filter (where status <> 'cancelled'), 0),
    coalesce(sum(outstanding_amount) filter (where status <> 'cancelled' and due_date < current_date and outstanding_amount > 0.005), 0),
    count(*) filter (where status <> 'cancelled' and due_date < current_date and outstanding_amount > 0.005),
    min(due_date) filter (where status <> 'cancelled' and outstanding_amount > 0.005)
  into v_p_paid, v_i_paid, v_outstanding, v_overdue, v_overdue_n, v_next_due
  from public.lending_installments
  where lending_record_id = p_record;

  select coalesce(sum(outstanding_amount), 0) into v_next_amt
  from public.lending_installments
  where lending_record_id = p_record and due_date = v_next_due and status <> 'cancelled';

  -- paid amount on the EARLIEST still-unpaid installment (mid-installment => partially_paid)
  select paid_amount into v_next_paid
  from public.lending_installments
  where lending_record_id = p_record and status <> 'cancelled' and outstanding_amount > 0.005
  order by installment_number limit 1;

  select * into rec from public.lending_records where id = p_record;

  v_new_status := rec.status;
  if rec.status not in ('cancelled','written_off') then
    if v_outstanding <= 0.005 then
      v_new_status := 'fully_paid';
    elsif v_overdue_n > 0 then
      v_new_status := 'overdue';
    elsif coalesce(v_next_paid, 0) > 0.005 then
      -- a payment has been made against the current (not yet due) installment
      v_new_status := 'partially_paid';
    else
      -- past installments fully paid, next one untouched: the loan is on track
      v_new_status := 'active';
    end if;
  end if;

  -- No-op when nothing changed: avoids pointless writes that would otherwise
  -- fan out through Realtime and trigger endless refetch loops.
  update public.lending_records set
    principal_received = v_p_paid,
    interest_received = v_i_paid,
    status = v_new_status,
    overdue_amount = v_overdue,
    overdue_installments = v_overdue_n,
    next_due_date = v_next_due,
    next_due_amount = coalesce(v_next_amt, 0),
    updated_at = now()
  where id = p_record
    and (
      principal_received is distinct from v_p_paid
      or interest_received is distinct from v_i_paid
      or status is distinct from v_new_status
      or overdue_amount is distinct from v_overdue
      or overdue_installments is distinct from v_overdue_n
      or next_due_date is distinct from v_next_due
      or next_due_amount is distinct from coalesce(v_next_amt, 0)
    );
end;
$$;

grant execute on function public.recompute_lending_from_installments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- generate_lending_schedule(): build (or rebuild) an installment schedule.
-- Rebuild is blocked once any repayment has been allocated.
-- ---------------------------------------------------------------------------
create or replace function public.generate_lending_schedule(
  p_record uuid,
  p_frequency text,
  p_first_due_date date,
  p_count int,
  p_interest_total numeric default 0
)
returns setof public.lending_installments
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.lending_records;
  step interval;
  principal_cents bigint;
  interest_cents bigint;
  base_p bigint;
  rem_p bigint;
  base_i bigint;
  rem_i bigint;
  n int;
  p_amt numeric(14,2);
  i_amt numeric(14,2);
  due date;
begin
  select * into rec from public.lending_records
    where id = p_record and user_id = auth.uid() for update;
  if not found then raise exception 'Lending record not found'; end if;

  if exists (select 1 from public.lending_repayment_allocations where user_id = auth.uid()
             and installment_id in (select id from public.lending_installments where lending_record_id = p_record)) then
    raise exception 'Cannot regenerate the schedule after repayments have been recorded';
  end if;
  if p_count < 1 or p_count > 600 then
    raise exception 'Installment count must be between 1 and 600';
  end if;
  if p_first_due_date < rec.lending_date then
    raise exception 'First due date cannot be before the lending date';
  end if;

  step := case p_frequency
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'yearly' then interval '1 year'
    else null end;
  if step is null then
    raise exception 'Unsupported schedule frequency: %', p_frequency;
  end if;

  delete from public.lending_installments where lending_record_id = p_record;

  -- Integer-paise split so the parts always sum exactly to the total.
  principal_cents := round(rec.principal_amount * 100)::bigint;
  interest_cents := round(coalesce(p_interest_total, 0) * 100)::bigint;
  base_p := principal_cents / p_count;
  rem_p := principal_cents - base_p * p_count;
  base_i := interest_cents / p_count;
  rem_i := interest_cents - base_i * p_count;

  for n in 1 .. p_count loop
    -- last installment(s) absorb the rounding remainder
    p_amt := (base_p + case when n > p_count - rem_p then 1 else 0 end)::numeric / 100;
    i_amt := (base_i + case when n > p_count - rem_i then 1 else 0 end)::numeric / 100;
    due := (p_first_due_date + step * (n - 1))::date;
    insert into public.lending_installments (
      lending_record_id, user_id, installment_number, due_date,
      scheduled_amount, principal_amount, interest_amount, outstanding_amount
    ) values (
      p_record, auth.uid(), n, due, p_amt + i_amt, p_amt, i_amt, p_amt + i_amt
    );
  end loop;

  update public.lending_records set
    schedule_generated = true,
    installment_frequency = p_frequency,
    payment_frequency = case p_frequency when 'weekly' then 'weekly' when 'monthly' then 'monthly'
                          when 'yearly' then 'yearly' else 'one_time' end,
    interest_type = case when coalesce(p_interest_total,0) > 0 then 'fixed' else interest_type end,
    interest_amount = coalesce(p_interest_total, 0),
    due_date = (p_first_due_date + step * (p_count - 1))::date
  where id = p_record;

  perform public.recompute_lending_from_installments(p_record);

  return query select * from public.lending_installments
    where lending_record_id = p_record order by installment_number;
end;
$$;

grant execute on function public.generate_lending_schedule(uuid,text,date,int,numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- record_lending_repayment(): unchanged accounting + allocate to installments
-- (oldest outstanding first) when a schedule exists.
-- ---------------------------------------------------------------------------
drop function if exists public.record_lending_repayment(uuid,numeric,numeric,numeric,date,uuid,uuid,text,text,uuid);

create or replace function public.record_lending_repayment(
  p_lending_record_id uuid,
  p_amount numeric,
  p_principal numeric,
  p_interest numeric,
  p_payment_date date,
  p_account_id uuid default null,
  p_payment_method_id uuid default null,
  p_notes text default null,
  p_attachment_url text default null,
  p_client_token uuid default null
)
returns public.lending_repayments
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.lending_records;
  repayment public.lending_repayments;
  interest_category uuid;
  inst public.lending_installments;
  rem_p numeric(14,2);
  rem_i numeric(14,2);
  alloc_p numeric(14,2);
  alloc_i numeric(14,2);
  last_inst uuid;
begin
  if p_client_token is not null then
    select * into repayment from public.lending_repayments
      where user_id = auth.uid() and client_token = p_client_token;
    if found then return repayment; end if;
  end if;

  select * into rec from public.lending_records
    where id = p_lending_record_id and user_id = auth.uid()
    for update;
  if not found then raise exception 'Lending record not found'; end if;

  if p_principal < 0 or p_interest < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  if round(p_principal + p_interest, 2) <> round(p_amount, 2) then
    raise exception 'Principal + interest must equal the repayment amount';
  end if;
  if p_principal > rec.outstanding_principal + 0.001 then
    raise exception 'Principal repayment exceeds outstanding principal';
  end if;
  if p_interest > rec.outstanding_interest + 0.001 then
    raise exception 'Interest repayment exceeds outstanding interest';
  end if;

  insert into public.lending_repayments (
    lending_record_id, user_id, amount, principal_amount, interest_amount,
    payment_date, account_id, payment_method_id, notes, attachment_url, client_token
  ) values (
    p_lending_record_id, auth.uid(), p_amount, p_principal, p_interest,
    p_payment_date, p_account_id, p_payment_method_id, p_notes, p_attachment_url, p_client_token
  ) returning * into repayment;

  update public.lending_records set
    principal_received = principal_received + p_principal,
    interest_received = interest_received + p_interest
  where id = p_lending_record_id;

  if p_account_id is not null then
    update public.accounts set current_balance = current_balance + p_amount, updated_at = now()
      where id = p_account_id and user_id = auth.uid()
        and public.is_available_cash_account(type);
  end if;

  if p_interest > 0 then
    select id into interest_category from public.categories
      where user_id = auth.uid() and type = 'income' and name = 'Interest' limit 1;
    insert into public.transactions (
      user_id, account_id, category_id, payment_method_id, type, amount,
      description, transaction_date, source, lending_repayment_id
    ) values (
      auth.uid(), null, interest_category, p_payment_method_id, 'income', p_interest,
      'Interest from ' || rec.borrower_name, p_payment_date, 'lending_interest', repayment.id
    );
  end if;

  -- Allocate to installments (oldest outstanding first).
  if rec.schedule_generated then
    rem_p := p_principal;
    rem_i := p_interest;
    for inst in
      select * from public.lending_installments
      where lending_record_id = p_lending_record_id and status <> 'cancelled'
        and outstanding_amount > 0.005
      order by installment_number
      for update
    loop
      exit when rem_p <= 0.005 and rem_i <= 0.005;
      alloc_p := least(rem_p, greatest(0, inst.principal_amount - inst.principal_paid));
      alloc_i := least(rem_i, greatest(0, inst.interest_amount - inst.interest_paid));
      if alloc_p > 0 or alloc_i > 0 then
        insert into public.lending_repayment_allocations
          (repayment_id, installment_id, user_id, principal_amount, interest_amount)
          values (repayment.id, inst.id, auth.uid(), alloc_p, alloc_i);
        update public.lending_installments set
          principal_paid = principal_paid + alloc_p,
          interest_paid = interest_paid + alloc_i,
          paid_amount = paid_amount + alloc_p + alloc_i,
          updated_at = now()
        where id = inst.id;
        rem_p := rem_p - alloc_p;
        rem_i := rem_i - alloc_i;
      end if;
    end loop;

    -- Any remainder (over-payment beyond the last need) lands on the last installment
    -- so allocations always sum to the repayment.
    if rem_p > 0.005 or rem_i > 0.005 then
      select id into last_inst from public.lending_installments
        where lending_record_id = p_lending_record_id order by installment_number desc limit 1;
      if last_inst is not null then
        insert into public.lending_repayment_allocations
          (repayment_id, installment_id, user_id, principal_amount, interest_amount)
          values (repayment.id, last_inst, auth.uid(), rem_p, rem_i);
        update public.lending_installments set
          principal_paid = principal_paid + rem_p,
          interest_paid = interest_paid + rem_i,
          paid_amount = paid_amount + rem_p + rem_i,
          updated_at = now()
        where id = last_inst;
      end if;
    end if;

    perform public.recompute_lending_from_installments(p_lending_record_id);
  end if;

  return repayment;
end;
$$;

grant execute on function public.record_lending_repayment(uuid,numeric,numeric,numeric,date,uuid,uuid,text,text,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_lending_repayment(): reverse everything including installment allocations.
-- ---------------------------------------------------------------------------
create or replace function public.delete_lending_repayment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rep public.lending_repayments;
  scheduled boolean;
  al public.lending_repayment_allocations;
begin
  select * into rep from public.lending_repayments
    where id = p_id and user_id = auth.uid()
    for update;
  if not found then raise exception 'Repayment not found'; end if;

  select schedule_generated into scheduled from public.lending_records where id = rep.lending_record_id;

  update public.lending_records set
    principal_received = greatest(0, principal_received - rep.principal_amount),
    interest_received = greatest(0, interest_received - rep.interest_amount)
  where id = rep.lending_record_id and user_id = auth.uid();

  if rep.account_id is not null then
    update public.accounts set current_balance = current_balance - rep.amount, updated_at = now()
      where id = rep.account_id and user_id = auth.uid()
        and public.is_available_cash_account(type);
  end if;

  delete from public.transactions
    where lending_repayment_id = rep.id and source = 'lending_interest' and user_id = auth.uid();

  -- reverse installment allocations before the cascade delete removes them
  for al in select * from public.lending_repayment_allocations where repayment_id = p_id loop
    update public.lending_installments set
      principal_paid = greatest(0, principal_paid - al.principal_amount),
      interest_paid = greatest(0, interest_paid - al.interest_amount),
      paid_amount = greatest(0, paid_amount - al.principal_amount - al.interest_amount),
      paid_date = null,
      updated_at = now()
    where id = al.installment_id and user_id = auth.uid();
  end loop;

  delete from public.lending_repayments where id = p_id;

  if coalesce(scheduled, false) then
    perform public.recompute_lending_from_installments(rep.lending_record_id);
  end if;
end;
$$;

grant execute on function public.delete_lending_repayment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Opportunistic refresh: recompute overdue/next-due for the caller's scheduled
-- loans whose stored state may be stale (dates roll forward with no writes).
-- Cheap; the frontend calls it when the lending pages load.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_lending_schedule_status()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r uuid;
begin
  for r in
    select id from public.lending_records
    where user_id = auth.uid() and schedule_generated
      and status not in ('cancelled','written_off','fully_paid')
  loop
    perform public.recompute_lending_from_installments(r);
  end loop;
end;
$$;

grant execute on function public.refresh_lending_schedule_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Overdue in the portfolio summaries now uses the denormalised, schedule-aware
-- lending_records.overdue_amount instead of the loan-level status flag.
-- ---------------------------------------------------------------------------
create or replace function public.get_lending_summary()
returns table (
  total_lent numeric,
  outstanding numeric,
  received numeric,
  interest_earned numeric,
  overdue numeric,
  borrower_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(principal_amount), 0),
    coalesce(sum(outstanding_principal + outstanding_interest), 0),
    coalesce(sum(principal_received + interest_received), 0),
    coalesce(sum(interest_received), 0),
    coalesce(sum(overdue_amount), 0),
    count(distinct borrower_name)::int
  from public.lending_records
  where user_id = auth.uid() and status not in ('cancelled','written_off');
$$;

grant execute on function public.get_lending_summary() to authenticated;

create or replace function public.get_financial_summary()
returns table (
  available_balance numeric,
  bank_balance numeric,
  cash_balance numeric,
  wallet_balance numeric,
  other_asset_balance numeric,
  credit_card_debt numeric,
  credit_limit numeric,
  available_credit numeric,
  credit_utilization numeric,
  money_lent numeric,
  receivable_outstanding numeric,
  principal_received numeric,
  interest_received numeric,
  overdue_amount numeric,
  borrower_count int,
  net_worth numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with acct as (
    select
      public.account_financial_type(type) as fin_type,
      current_balance,
      coalesce(nullif(metadata->>'current_outstanding','')::numeric, 0) as outstanding,
      coalesce(nullif(metadata->>'credit_limit','')::numeric, 0) as climit
    from public.accounts
    where user_id = auth.uid() and is_active
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
      coalesce(sum(overdue_amount), 0) as overdue_amount,
      count(distinct borrower_name)::int as borrower_count
    from public.lending_records
    where user_id = auth.uid() and status not in ('cancelled','written_off')
  )
  select
    a.available_balance, a.bank_balance, a.cash_balance, a.wallet_balance, a.other_asset_balance,
    a.credit_card_debt, a.credit_limit,
    greatest(0, a.credit_limit - a.credit_card_debt) as available_credit,
    case when a.credit_limit > 0 then round((a.credit_card_debt / a.credit_limit) * 100, 1) else 0 end as credit_utilization,
    l.money_lent, l.receivable_outstanding, l.principal_received, l.interest_received,
    l.overdue_amount, l.borrower_count,
    (a.available_balance + l.receivable_outstanding - a.credit_card_debt) as net_worth
  from a, l;
$$;

grant execute on function public.get_financial_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Edit an installment due date, then re-derive status.
-- ---------------------------------------------------------------------------
create or replace function public.update_installment_due_date(p_installment uuid, p_due_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_record uuid;
begin
  update public.lending_installments
    set due_date = p_due_date, updated_at = now()
    where id = p_installment and user_id = auth.uid()
    returning lending_record_id into v_record;
  if v_record is null then raise exception 'Installment not found'; end if;
  perform public.recompute_lending_from_installments(v_record);
end;
$$;

grant execute on function public.update_installment_due_date(uuid,date) to authenticated;

-- Backfill overdue_amount / next_due_date on existing (non-scheduled) loans by
-- re-firing the recalc trigger once.
update public.lending_records set updated_at = now() where schedule_generated = false;

-- Realtime
do $$ begin alter publication supabase_realtime add table public.lending_installments;
exception when duplicate_object then null; end $$;



-- ============================================================
-- 019_payment_method_fields.sql
-- ============================================================
-- 019_payment_method_fields.sql
-- Presentation + management fields for the redesigned Payment Methods page:
-- short description, Lucide icon name, accent colour, active flag and a manual
-- sort order for drag-to-reorder. All additive and optional — existing
-- transaction / repayment logic is untouched. Icons are stored as the stable
-- Lucide name string only (never SVG / markup / emoji).
alter table public.payment_methods
  add column if not exists description text,
  add column if not exists icon text,
  add column if not exists color text,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0;

-- Backfill the seeded defaults with sensible presentation values.
update public.payment_methods p set
  description = coalesce(p.description, d.description),
  icon       = coalesce(p.icon, d.icon),
  color      = coalesce(p.color, d.color)
from (values
  ('Cash',          'Physical cash payment',              'Banknote',      '#F59E0B'),
  ('UPI',           'Google Pay, PhonePe, Paytm, etc.',   'Smartphone',    '#EC4899'),
  ('Bank Transfer', 'Direct bank account transfer',       'Landmark',      '#2F6F63'),
  ('Credit Card',   'Visa, Mastercard, etc.',             'CreditCard',    '#3B82F6'),
  ('Debit Card',    'Direct debit card payment',          'CreditCard',    '#8B5CF6'),
  ('Wallet',        'Digital wallet payment',             'Wallet',        '#0EA5E9'),
  ('Other',         'Other payment method',               'MoreHorizontal','#7C9B95')
) as d(name, description, icon, color)
where p.name = d.name;

-- Give existing rows a stable initial order (alphabetical, defaults first).
update public.payment_methods p set sort_order = s.rn
from (
  select id, (row_number() over (partition by user_id order by is_default desc, name)) - 1 as rn
  from public.payment_methods
) s
where s.id = p.id and p.sort_order = 0;

comment on column public.payment_methods.icon is 'Stable Lucide icon name only (presentation metadata).';

notify pgrst, 'reload schema';


-- ============================================================
-- 020_bills_and_recurring.sql


-- ============================================================
-- 020_bills_and_recurring.sql


-- ============================================================
-- 020_bills_and_recurring.sql
-- ============================================================
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


-- ============================================================
-- 021_lending_record_delete.sql
-- ============================================================
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


-- ============================================================
-- 022_recurring_payment_hard_delete.sql
-- ============================================================
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


-- ============================================================
-- 023_subscriptions.sql
-- ============================================================
-- 023_subscriptions.sql
-- =========================================================================
-- Subscription & Plans system (Free / Pro).
--
-- Database-driven: plan prices/features/limits live in subscription_plans,
-- never hardcoded in React. Every user has exactly one user_subscriptions
-- row (auto-provisioned to Free); subscription_events is an append-only,
-- idempotent log for payment-provider webhooks.
--
-- Trust boundary: authenticated users get SELECT only on user_subscriptions /
-- subscription_events (RLS + explicit REVOKE of write grants). Status, plan,
-- billing period and provider ids can only change through SECURITY DEFINER
-- RPCs or a service-role webhook — never directly from the browser.
--
-- This module does not touch account balances, transactions' financial
-- meaning, lending, bills or EMI accounting. It only adds a BEFORE INSERT
-- guard on accounts/budgets/recurring_transactions/lending_records/
-- transactions that blocks a NEW row once a Free-plan limit is reached; it
-- never touches existing rows, balances or the values a row is inserted with,
-- and it never blocks system-generated transactions (bill/EMI/lending
-- postings) — only source = 'manual' entries count toward the monthly cap.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Plans (database-driven; -1 in `limits` means unlimited, consistently).
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug = lower(slug)),
  description text,
  price_monthly numeric(10,2) not null default 0 check (price_monthly >= 0),
  price_yearly numeric(10,2) not null default 0 check (price_yearly >= 0),
  currency text not null default 'INR',
  features jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. One subscription per user.
-- ---------------------------------------------------------------------------
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'active'
    check (status in ('trialing','active','past_due','paused','cancelled','expired')),
  billing_cycle text check (billing_cycle in ('monthly','yearly')),
  provider text,                       -- e.g. 'razorpay' | 'stripe' | 'cashfree'; null until integrated
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_start timestamptz,
  trial_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_subscriptions_status on public.user_subscriptions (status);
create index if not exists idx_user_subscriptions_provider_sub
  on public.user_subscriptions (provider_subscription_id) where provider_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Append-only webhook/lifecycle log. provider_event_id is unique so a
--    redelivered webhook can never be processed twice.
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_subscription_events_provider_event
  on public.subscription_events (provider_event_id) where provider_event_id is not null;
create index if not exists idx_subscription_events_user on public.subscription_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. RLS.
--    subscription_plans : anyone may read active plans (pricing page).
--    user_subscriptions / subscription_events : owner may SELECT only —
--    all writes happen through the RPCs below or a service-role webhook.
-- ---------------------------------------------------------------------------
alter table public.subscription_plans enable row level security;
drop policy if exists "plans_select_active" on public.subscription_plans;
create policy "plans_select_active" on public.subscription_plans
  for select using (is_active);

alter table public.user_subscriptions enable row level security;
drop policy if exists "own_select" on public.user_subscriptions;
create policy "own_select" on public.user_subscriptions
  for select using (user_id = auth.uid());

alter table public.subscription_events enable row level security;
drop policy if exists "own_select" on public.subscription_events;
create policy "own_select" on public.subscription_events
  for select using (user_id = auth.uid());

-- Table-level defense in depth: even though migration 015 grants broad
-- CRUD to `authenticated` by default, explicitly take direct write access
-- away from these three tables. Only SECURITY DEFINER RPCs (owned by the
-- migration role) and the service-role webhook may write to them.
revoke insert, update, delete on public.subscription_plans from authenticated, anon;
revoke insert, update, delete on public.user_subscriptions from authenticated, anon;
revoke insert, update, delete on public.subscription_events from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. Seed Free + Pro (idempotent — safe to re-run this migration).
-- ---------------------------------------------------------------------------
insert into public.subscription_plans (name, slug, description, price_monthly, price_yearly, sort_order, features, limits)
values
  (
    'Free', 'free', 'Everything you need to start tracking your money.',
    0, 0, 0,
    jsonb_build_object(
      'advanced_analytics', false,
      'advanced_reports', false,
      'pdf_reports', false,
      'csv_export', false,
      'financial_insights', false
    ),
    jsonb_build_object(
      'accounts', 3,
      'transactions_per_month', 500,
      'budgets', 3,
      'bills', 5,
      'lending_records', 5
    )
  ),
  (
    'Pro', 'pro', 'Unlimited tracking with advanced insights and exports.',
    199, 1999, 1,
    jsonb_build_object(
      'advanced_analytics', true,
      'advanced_reports', true,
      'pdf_reports', true,
      'csv_export', true,
      'financial_insights', true
    ),
    jsonb_build_object(
      'accounts', -1,
      'transactions_per_month', -1,
      'budgets', -1,
      'bills', -1,
      'lending_records', -1
    )
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  sort_order = excluded.sort_order,
  features = excluded.features,
  limits = excluded.limits,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 6. Backfill: every existing user gets a Free subscription. New users get
--    one from ensure_user_setup() below (called on SIGNED_IN, same as
--    profile + default categories). Either path is idempotent
--    (unique user_id, ON CONFLICT DO NOTHING) — never overwrites a real one.
-- ---------------------------------------------------------------------------
insert into public.user_subscriptions (user_id, plan_id, status)
select u.id, p.id, 'active'
from auth.users u
cross join lateral (select id from public.subscription_plans where slug = 'free' limit 1) p
where not exists (select 1 from public.user_subscriptions s where s.user_id = u.id)
on conflict (user_id) do nothing;

-- Extend the existing first-login setup (migration 011) to also provision a
-- Free subscription. Profile + category seeding behaviour is unchanged.
create or replace function public.ensure_user_setup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (auth.uid(), auth.jwt() ->> 'email')
    on conflict (id) do nothing;
  if not exists (select 1 from public.categories where user_id = auth.uid()) then
    perform public.seed_user_defaults(auth.uid());
  end if;
  insert into public.user_subscriptions (user_id, plan_id, status)
    select auth.uid(), id, 'active' from public.subscription_plans where slug = 'free'
    on conflict (user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. get_my_subscription(): the single read path for the whole app. Self-
--    heals — if a user somehow has no row yet, it provisions Free on the
--    spot instead of ever resolving to "no plan".
-- ---------------------------------------------------------------------------
create or replace function public.get_my_subscription()
returns table (
  subscription_id uuid,
  plan_id uuid,
  plan_slug text,
  plan_name text,
  price_monthly numeric,
  price_yearly numeric,
  currency text,
  features jsonb,
  limits jsonb,
  status text,
  billing_cycle text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  trial_start timestamptz,
  trial_end timestamptz,
  cancelled_at timestamptz,
  provider text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.user_subscriptions;
  v_free uuid;
begin
  select * into v_sub from public.user_subscriptions where user_id = auth.uid();
  if not found then
    select id into v_free from public.subscription_plans where slug = 'free';
    insert into public.user_subscriptions (user_id, plan_id, status)
      values (auth.uid(), v_free, 'active')
      on conflict (user_id) do nothing;
    select * into v_sub from public.user_subscriptions where user_id = auth.uid();
  end if;

  return query
    select v_sub.id, p.id, p.slug, p.name, p.price_monthly, p.price_yearly, p.currency,
           p.features, p.limits, v_sub.status, v_sub.billing_cycle,
           v_sub.current_period_start, v_sub.current_period_end, v_sub.cancel_at_period_end,
           v_sub.trial_start, v_sub.trial_end, v_sub.cancelled_at, v_sub.provider
    from public.subscription_plans p
    where p.id = v_sub.plan_id;
end;
$$;

grant execute on function public.get_my_subscription() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. get_subscription_usage(): actual counts vs. the caller's effective
--    limits, in one round trip. -1 in `limits` == unlimited, consistently.
-- ---------------------------------------------------------------------------
create or replace function public.get_subscription_usage()
returns table (resource text, used int, limit_value int, unlimited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits jsonb;
  v_accounts int; v_budgets int; v_bills int; v_lending int; v_tx int;
  v_l_accounts int; v_l_budgets int; v_l_bills int; v_l_lending int; v_l_tx int;
begin
  select limits into v_limits from public.get_my_subscription();

  select count(*) into v_accounts from public.accounts where user_id = auth.uid();
  select count(*) into v_budgets from public.budgets
    where user_id = auth.uid()
      and year = extract(year from current_date)::int
      and month = extract(month from current_date)::int;
  select count(*) into v_bills from public.recurring_transactions
    where user_id = auth.uid() and status = 'active';
  select count(*) into v_lending from public.lending_records
    where user_id = auth.uid() and status not in ('cancelled','written_off');
  select count(*) into v_tx from public.transactions
    where user_id = auth.uid() and source = 'manual'
      and transaction_date >= date_trunc('month', current_date)::date
      and transaction_date < (date_trunc('month', current_date) + interval '1 month')::date;

  v_l_accounts := coalesce((v_limits->>'accounts')::int, -1);
  v_l_budgets  := coalesce((v_limits->>'budgets')::int, -1);
  v_l_bills    := coalesce((v_limits->>'bills')::int, -1);
  v_l_lending  := coalesce((v_limits->>'lending_records')::int, -1);
  v_l_tx       := coalesce((v_limits->>'transactions_per_month')::int, -1);

  return query
    select 'accounts'::text, v_accounts, v_l_accounts, (v_l_accounts = -1)
    union all
    select 'budgets', v_budgets, v_l_budgets, (v_l_budgets = -1)
    union all
    select 'bills', v_bills, v_l_bills, (v_l_bills = -1)
    union all
    select 'lending_records', v_lending, v_l_lending, (v_l_lending = -1)
    union all
    select 'transactions_per_month', v_tx, v_l_tx, (v_l_tx = -1);
end;
$$;

grant execute on function public.get_subscription_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Cancel / resume. Cancellation never downgrades immediately — Pro stays
--    active until current_period_end; the (future) webhook/processor flips
--    it to 'expired' once that date passes. Users cannot set status/plan
--    themselves; these RPCs are the only door.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_subscription()
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare v_sub public.user_subscriptions;
begin
  update public.user_subscriptions
    set cancel_at_period_end = true, cancelled_at = now(), updated_at = now()
    where user_id = auth.uid() and status in ('active','trialing','past_due')
    returning * into v_sub;
  if not found then
    raise exception 'No active subscription to cancel';
  end if;

  insert into public.subscription_events (user_id, subscription_id, event_type, payload)
    values (auth.uid(), v_sub.id, 'cancel_requested', jsonb_build_object('at', now()));

  return v_sub;
end;
$$;

create or replace function public.resume_subscription()
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare v_sub public.user_subscriptions;
begin
  update public.user_subscriptions
    set cancel_at_period_end = false, cancelled_at = null, updated_at = now()
    where user_id = auth.uid() and cancel_at_period_end = true
      and status in ('active','trialing','past_due')
    returning * into v_sub;
  if not found then
    raise exception 'No pending cancellation to resume';
  end if;

  insert into public.subscription_events (user_id, subscription_id, event_type, payload)
    values (auth.uid(), v_sub.id, 'cancel_reverted', jsonb_build_object('at', now()));

  return v_sub;
end;
$$;

grant execute on function public.cancel_subscription() to authenticated;
grant execute on function public.resume_subscription() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Server-side entitlement enforcement. Frontend checks (useSubscription /
--     canCreate) are UX only — this trigger is the real gate and cannot be
--     bypassed by calling supabase-js directly from the browser.
--
--     * Only Free-plan limits ever block anything (-1 == unlimited, Pro's
--       limits are always -1, so Pro is never touched by this trigger).
--     * transactions: only source = 'manual' rows count / are gated — bill
--       payments, EMI postings and lending interest income are system-
--       generated and must never be blocked by a user's manual-entry cap.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_limit int;
  v_count int;
begin
  v_key := case tg_table_name
    when 'accounts' then 'accounts'
    when 'budgets' then 'budgets'
    when 'recurring_transactions' then 'bills'
    when 'lending_records' then 'lending_records'
    when 'transactions' then 'transactions_per_month'
    else null
  end;
  if v_key is null then
    return new;
  end if;
  if tg_table_name = 'transactions' and coalesce(new.source, 'manual') <> 'manual' then
    return new; -- system-generated postings (bills, EMI, lending interest) are never capped
  end if;

  select coalesce((p.limits->>v_key)::int, -1) into v_limit
  from public.user_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.user_id = new.user_id and s.status in ('active','trialing');

  if not found then
    -- No subscription row yet (should be rare — ensure_user_setup provisions
    -- one) — fall back to the Free plan's limits rather than allow/deny blind.
    select coalesce((limits->>v_key)::int, -1) into v_limit
    from public.subscription_plans where slug = 'free';
  end if;

  if v_limit is null or v_limit < 0 then
    return new; -- unlimited on this plan
  end if;

  if tg_table_name = 'accounts' then
    select count(*) into v_count from public.accounts where user_id = new.user_id;
  elsif tg_table_name = 'budgets' then
    select count(*) into v_count from public.budgets
      where user_id = new.user_id and year = new.year and month = new.month;
  elsif tg_table_name = 'recurring_transactions' then
    select count(*) into v_count from public.recurring_transactions
      where user_id = new.user_id and status = 'active';
  elsif tg_table_name = 'lending_records' then
    select count(*) into v_count from public.lending_records
      where user_id = new.user_id and status not in ('cancelled','written_off');
  elsif tg_table_name = 'transactions' then
    select count(*) into v_count from public.transactions
      where user_id = new.user_id and source = 'manual'
        and transaction_date >= date_trunc('month', new.transaction_date)::date
        and transaction_date < (date_trunc('month', new.transaction_date) + interval '1 month')::date;
  end if;

  if v_count >= v_limit then
    raise exception using
      message = format('PLAN_LIMIT:%s', v_key),
      detail = format('%s of %s used on the Free plan.', v_count, v_limit),
      errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_plan_limit_accounts on public.accounts;
create trigger trg_plan_limit_accounts
  before insert on public.accounts
  for each row execute function public.enforce_subscription_limit();

drop trigger if exists trg_plan_limit_budgets on public.budgets;
create trigger trg_plan_limit_budgets
  before insert on public.budgets
  for each row execute function public.enforce_subscription_limit();

drop trigger if exists trg_plan_limit_bills on public.recurring_transactions;
create trigger trg_plan_limit_bills
  before insert on public.recurring_transactions
  for each row execute function public.enforce_subscription_limit();

drop trigger if exists trg_plan_limit_lending on public.lending_records;
create trigger trg_plan_limit_lending
  before insert on public.lending_records
  for each row execute function public.enforce_subscription_limit();

drop trigger if exists trg_plan_limit_transactions on public.transactions;
create trigger trg_plan_limit_transactions
  before insert on public.transactions
  for each row execute function public.enforce_subscription_limit();

-- ---------------------------------------------------------------------------
-- 11. Realtime — so the plan badge / subscription page update live once a
--     webhook (or another device) changes the row.
-- ---------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.user_subscriptions;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';


-- ============================================================
-- 024_admin_system.sql
-- ============================================================
-- 024_admin_system.sql
-- =========================================================================
-- Super Admin system.
--
-- Role-based, database-backed authorization — never email-based, never
-- trusted from the frontend. Every admin RPC calls require_admin() /
-- require_super_admin() as its first statement and re-derives the caller
-- from auth.uid(); a role claimed by the client is never honoured.
--
-- Reuses the existing subscription system (subscription_plans,
-- user_subscriptions, subscription_events, get_subscription_usage's logic)
-- rather than duplicating it. Does not touch account/transaction/lending/
-- bill accounting.
--
-- User suspension is enforced the officially-supported Supabase way (Auth
-- ban via the service-role Admin API, from the admin-actions Edge Function)
-- rather than retrofitting a status check onto every existing RLS policy in
-- the app — see the note above admin-actions/index.ts for why.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Roles.
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'super_admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (user_id, role)
);

create index if not exists idx_user_roles_user on public.user_roles (user_id);

-- Display-only account status. The enforced ban lives in Supabase Auth
-- (auth.users.banned_until) via the admin-actions Edge Function; this column
-- lets the UI show/filter status without an extra round trip.
alter table public.profiles
  add column if not exists status text not null default 'active' check (status in ('active', 'suspended'));

-- ---------------------------------------------------------------------------
-- 2. Audit log. Append-only from the client's point of view — every write
--    happens inside a SECURITY DEFINER admin RPC (or the Edge Function),
--    never directly.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.admin_audit_logs (created_at desc);
create index if not exists idx_audit_logs_admin on public.admin_audit_logs (admin_user_id, created_at desc);
create index if not exists idx_audit_logs_target on public.admin_audit_logs (target_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Role helpers. STABLE + SECURITY DEFINER so they can be used inside RLS
--    policies and other functions without a recursive-RLS problem on
--    user_roles itself.
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_user uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = p_user and role = p_role);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'super_admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'admin');
$$;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.require_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS.
--    user_roles / admin_audit_logs: admins may SELECT; nobody writes
--    directly (RPCs + the Edge Function, both SECURITY DEFINER / service
--    role, are the only doors).
-- ---------------------------------------------------------------------------
alter table public.user_roles enable row level security;
drop policy if exists "admin_select" on public.user_roles;
create policy "admin_select" on public.user_roles for select using (public.is_admin());
revoke insert, update, delete on public.user_roles from authenticated, anon;

alter table public.admin_audit_logs enable row level security;
drop policy if exists "admin_select" on public.admin_audit_logs;
create policy "admin_select" on public.admin_audit_logs for select using (public.is_admin());
revoke insert, update, delete on public.admin_audit_logs from authenticated, anon;

-- Admins may additionally see inactive plans (regular users still only see
-- is_active ones — this ADDS a policy, it does not touch the existing one;
-- Postgres OR-combines multiple permissive SELECT policies).
drop policy if exists "plans_select_admin" on public.subscription_plans;
create policy "plans_select_admin" on public.subscription_plans for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Internal audit helper — used by every sensitive admin RPC below.
-- ---------------------------------------------------------------------------
create or replace function public._log_admin_action(
  p_action text, p_target_user uuid, p_resource_type text, p_resource_id uuid, p_metadata jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_audit_logs (admin_user_id, action, target_user_id, resource_type, resource_id, metadata)
  values (auth.uid(), p_action, p_target_user, p_resource_type, p_resource_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- 6. Reuse, don't duplicate: extract the usage calculation from the existing
--    get_subscription_usage() (023) into a parameterised internal function,
--    then make get_subscription_usage() a thin wrapper over it. Behaviour
--    and output for the existing personal endpoint are unchanged.
-- ---------------------------------------------------------------------------
create or replace function public._subscription_usage_for(p_user uuid)
returns table (resource text, used int, limit_value int, unlimited boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limits jsonb;
  v_accounts int; v_budgets int; v_bills int; v_lending int; v_tx int;
  v_l_accounts int; v_l_budgets int; v_l_bills int; v_l_lending int; v_l_tx int;
begin
  select p.limits into v_limits
  from public.user_subscriptions s join public.subscription_plans p on p.id = s.plan_id
  where s.user_id = p_user;
  if v_limits is null then
    select limits into v_limits from public.subscription_plans where slug = 'free';
  end if;

  select count(*) into v_accounts from public.accounts where user_id = p_user;
  select count(*) into v_budgets from public.budgets
    where user_id = p_user
      and year = extract(year from current_date)::int
      and month = extract(month from current_date)::int;
  select count(*) into v_bills from public.recurring_transactions
    where user_id = p_user and status = 'active';
  select count(*) into v_lending from public.lending_records
    where user_id = p_user and status not in ('cancelled', 'written_off');
  select count(*) into v_tx from public.transactions
    where user_id = p_user and source = 'manual'
      and transaction_date >= date_trunc('month', current_date)::date
      and transaction_date < (date_trunc('month', current_date) + interval '1 month')::date;

  v_l_accounts := coalesce((v_limits->>'accounts')::int, -1);
  v_l_budgets  := coalesce((v_limits->>'budgets')::int, -1);
  v_l_bills    := coalesce((v_limits->>'bills')::int, -1);
  v_l_lending  := coalesce((v_limits->>'lending_records')::int, -1);
  v_l_tx       := coalesce((v_limits->>'transactions_per_month')::int, -1);

  return query
    select 'accounts'::text, v_accounts, v_l_accounts, (v_l_accounts = -1)
    union all
    select 'budgets', v_budgets, v_l_budgets, (v_l_budgets = -1)
    union all
    select 'bills', v_bills, v_l_bills, (v_l_bills = -1)
    union all
    select 'lending_records', v_lending, v_l_lending, (v_l_lending = -1)
    union all
    select 'transactions_per_month', v_tx, v_l_tx, (v_l_tx = -1);
end;
$$;

create or replace function public.get_subscription_usage()
returns table (resource text, used int, limit_value int, unlimited boolean)
language sql
stable
security definer
set search_path = public
as $$
  select * from public._subscription_usage_for(auth.uid());
$$;

grant execute on function public.get_subscription_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Users: list, detail, usage, gated financial snapshot.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_search text default null,
  p_plan_slug text default null,
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  user_id uuid, email text, full_name text, avatar_url text, status text,
  created_at timestamptz, plan_slug text, plan_name text, subscription_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email, p.full_name, p.avatar_url, p.status, p.created_at,
           sp.slug, sp.name, us.status,
           count(*) over ()::bigint
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%')
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
      and (p_status is null or p_status = '' or p.status = p_status)
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_get_user_details(p_user uuid)
returns table (
  user_id uuid, email text, full_name text, avatar_url text, status text, created_at timestamptz,
  last_sign_in_at timestamptz,
  plan_slug text, plan_name text, subscription_status text, billing_cycle text,
  current_period_end timestamptz, cancel_at_period_end boolean, trial_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email, p.full_name, p.avatar_url, p.status, p.created_at, u.last_sign_in_at,
           sp.slug, sp.name, us.status, us.billing_cycle,
           us.current_period_end, us.cancel_at_period_end, us.trial_end
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where u.id = p_user;
end;
$$;

create or replace function public.admin_get_user_usage(p_user uuid)
returns table (resource text, used int, limit_value int, unlimited boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query select * from public._subscription_usage_for(p_user);
end;
$$;

-- Explicit, audited, summarised only (never a raw data dump) — see spec §13.
create or replace function public.admin_view_financial_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'account_count', (select count(*) from public.accounts where user_id = p_user),
    'total_balance', (select coalesce(sum(current_balance), 0) from public.accounts where user_id = p_user and is_active),
    'active_bills', (select count(*) from public.recurring_transactions where user_id = p_user and status = 'active'),
    'active_lending', (select count(*) from public.lending_records where user_id = p_user and status not in ('cancelled', 'written_off')),
    'lending_outstanding', (select coalesce(sum(outstanding_principal + outstanding_interest), 0)
                             from public.lending_records where user_id = p_user and status not in ('cancelled', 'written_off')),
    'recent_transactions', (
      select coalesce(jsonb_agg(t order by t.transaction_date desc), '[]'::jsonb)
      from (
        select type, amount, description, transaction_date
        from public.transactions where user_id = p_user
        order by transaction_date desc limit 10
      ) t
    )
  ) into v_result;

  perform public._log_admin_action('FINANCIAL_DATA_VIEWED', p_user, 'user_financial_data', p_user, '{}'::jsonb);

  return v_result;
end;
$$;

grant execute on function public.admin_list_users(text, text, text, int, int) to authenticated;
grant execute on function public.admin_get_user_details(uuid) to authenticated;
grant execute on function public.admin_get_user_usage(uuid) to authenticated;
grant execute on function public.admin_view_financial_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Subscriptions & plans (reusing the existing tables — no parallel schema).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_subscriptions(
  p_status text default null,
  p_plan_slug text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  subscription_id uuid, user_id uuid, email text, full_name text,
  plan_slug text, plan_name text, price_monthly numeric, price_yearly numeric,
  status text, billing_cycle text, current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean, provider text, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select us.id, us.user_id, u.email, p.full_name,
           sp.slug, sp.name, sp.price_monthly, sp.price_yearly,
           us.status, us.billing_cycle, us.current_period_start, us.current_period_end,
           us.cancel_at_period_end, us.provider, us.created_at,
           count(*) over ()::bigint
    from public.user_subscriptions us
    join auth.users u on u.id = us.user_id
    join public.profiles p on p.id = us.user_id
    join public.subscription_plans sp on sp.id = us.plan_id
    where (p_status is null or p_status = '' or us.status = p_status)
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
    order by us.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_change_user_plan(p_user uuid, p_plan_slug text, p_billing_cycle text, p_reason text default null)
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans;
  v_sub public.user_subscriptions;
  v_before text;
begin
  perform public.require_super_admin();

  select * into v_plan from public.subscription_plans where slug = p_plan_slug and is_active;
  if not found then raise exception 'Unknown plan'; end if;
  if p_billing_cycle not in ('monthly', 'yearly') then raise exception 'Invalid billing cycle'; end if;

  select status into v_before from public.user_subscriptions where user_id = p_user;

  update public.user_subscriptions set
    plan_id = v_plan.id,
    billing_cycle = p_billing_cycle,
    status = 'active',
    cancel_at_period_end = false,
    cancelled_at = null,
    current_period_start = now(),
    current_period_end = now() + case when p_billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end,
    updated_at = now()
  where user_id = p_user
  returning * into v_sub;

  if not found then raise exception 'Subscription not found for this user'; end if;

  perform public._log_admin_action('PLAN_CHANGED', p_user, 'user_subscriptions', v_sub.id,
    jsonb_build_object('from_status', v_before, 'to_plan', p_plan_slug, 'billing_cycle', p_billing_cycle, 'reason', p_reason));

  return v_sub;
end;
$$;

create or replace function public.admin_cancel_subscription(p_user uuid, p_reason text default null)
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare v_sub public.user_subscriptions;
begin
  perform public.require_admin();
  update public.user_subscriptions
    set cancel_at_period_end = true, cancelled_at = now(), updated_at = now()
    where user_id = p_user and status in ('active', 'trialing', 'past_due')
    returning * into v_sub;
  if not found then raise exception 'No active subscription to cancel'; end if;

  perform public._log_admin_action('SUBSCRIPTION_CANCELLED', p_user, 'user_subscriptions', v_sub.id,
    jsonb_build_object('reason', p_reason));
  return v_sub;
end;
$$;

create or replace function public.admin_resume_subscription(p_user uuid, p_reason text default null)
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare v_sub public.user_subscriptions;
begin
  perform public.require_admin();
  update public.user_subscriptions
    set cancel_at_period_end = false, cancelled_at = null, updated_at = now()
    where user_id = p_user and cancel_at_period_end = true and status in ('active', 'trialing', 'past_due')
    returning * into v_sub;
  if not found then raise exception 'No pending cancellation to resume'; end if;

  perform public._log_admin_action('SUBSCRIPTION_RESUMED', p_user, 'user_subscriptions', v_sub.id,
    jsonb_build_object('reason', p_reason));
  return v_sub;
end;
$$;

create or replace function public.admin_update_plan(
  p_plan_id uuid, p_name text, p_description text,
  p_price_monthly numeric, p_price_yearly numeric, p_currency text,
  p_features jsonb, p_limits jsonb, p_is_active boolean, p_sort_order int
)
returns public.subscription_plans
language plpgsql
security definer
set search_path = public
as $$
declare v_plan public.subscription_plans;
begin
  perform public.require_super_admin();
  if p_price_monthly < 0 or p_price_yearly < 0 then raise exception 'Price cannot be negative'; end if;

  -- Plan configuration only. This never touches user_subscriptions rows, so
  -- nobody's billing history or currently-locked-in price changes.
  update public.subscription_plans set
    name = p_name, description = p_description,
    price_monthly = p_price_monthly, price_yearly = p_price_yearly, currency = p_currency,
    features = p_features, limits = p_limits, is_active = p_is_active, sort_order = p_sort_order,
    updated_at = now()
  where id = p_plan_id
  returning * into v_plan;

  if not found then raise exception 'Plan not found'; end if;

  perform public._log_admin_action('PLAN_UPDATED', null, 'subscription_plans', v_plan.id,
    jsonb_build_object('slug', v_plan.slug));
  return v_plan;
end;
$$;

grant execute on function public.admin_list_subscriptions(text, text, int, int) to authenticated;
grant execute on function public.admin_change_user_plan(uuid, text, text, text) to authenticated;
grant execute on function public.admin_cancel_subscription(uuid, text) to authenticated;
grant execute on function public.admin_resume_subscription(uuid, text) to authenticated;
grant execute on function public.admin_update_plan(uuid, text, text, numeric, numeric, text, jsonb, jsonb, boolean, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Payments (subscription_events — no invented amounts; only what the
--    (future) webhook actually recorded).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_payments(
  p_event_type text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  event_id uuid, user_id uuid, email text, event_type text, provider_event_id text,
  payload jsonb, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select e.id, e.user_id, u.email, e.event_type, e.provider_event_id, e.payload, e.created_at,
           count(*) over ()::bigint
    from public.subscription_events e
    left join auth.users u on u.id = e.user_id
    where p_event_type is null or p_event_type = '' or e.event_type = p_event_type
    order by e.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

grant execute on function public.admin_list_payments(text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Audit log viewer.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_audit_logs(
  p_admin_user uuid default null,
  p_action text default null,
  p_target_user uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  log_id uuid, admin_user_id uuid, admin_email text, action text,
  target_user_id uuid, target_email text, resource_type text, resource_id uuid,
  metadata jsonb, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select l.id, l.admin_user_id, au.email, l.action, l.target_user_id, tu.email,
           l.resource_type, l.resource_id, l.metadata, l.created_at,
           count(*) over ()::bigint
    from public.admin_audit_logs l
    left join auth.users au on au.id = l.admin_user_id
    left join auth.users tu on tu.id = l.target_user_id
    where (p_admin_user is null or l.admin_user_id = p_admin_user)
      and (p_action is null or p_action = '' or l.action = p_action)
      and (p_target_user is null or l.target_user_id = p_target_user)
      and (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at <= p_to)
    order by l.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

grant execute on function public.admin_list_audit_logs(uuid, text, uuid, timestamptz, timestamptz, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Dashboard stats + growth series. Real aggregates only; MRR/ARR are
--     computed from actual user_subscriptions rows (naturally 0 until real
--     Pro subscriptions exist — never invented).
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_dashboard_stats()
returns table (
  total_users int, active_users int, suspended_users int,
  free_users int, pro_users int,
  active_subscriptions int, trialing_subscriptions int, past_due_subscriptions int, cancelled_subscriptions int,
  new_users_7d int, new_users_30d int,
  mrr numeric, arr numeric, currency text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select
      (select count(*)::int from public.profiles),
      (select count(*)::int from public.profiles where status = 'active'),
      (select count(*)::int from public.profiles where status = 'suspended'),
      (select count(*)::int from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id where p.slug = 'free'),
      (select count(*)::int from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id where p.slug = 'pro' and us.status in ('active', 'trialing')),
      (select count(*)::int from public.user_subscriptions where status = 'active'),
      (select count(*)::int from public.user_subscriptions where status = 'trialing'),
      (select count(*)::int from public.user_subscriptions where status = 'past_due'),
      (select count(*)::int from public.user_subscriptions where status = 'cancelled'),
      (select count(*)::int from public.profiles where created_at >= now() - interval '7 days'),
      (select count(*)::int from public.profiles where created_at >= now() - interval '30 days'),
      coalesce((
        select sum(case when us.billing_cycle = 'yearly' then p.price_yearly / 12.0 else p.price_monthly end)
        from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id
        where p.slug = 'pro' and us.status = 'active'
      ), 0),
      coalesce((
        select sum(case when us.billing_cycle = 'yearly' then p.price_yearly else p.price_monthly * 12 end)
        from public.user_subscriptions us join public.subscription_plans p on p.id = us.plan_id
        where p.slug = 'pro' and us.status = 'active'
      ), 0),
      'INR';
end;
$$;

create or replace function public.admin_user_growth(p_days int default 30)
returns table (day date, new_users int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select d::date, coalesce(c.n, 0)::int
    from generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day') d
    left join (
      select created_at::date as day, count(*) as n from public.profiles group by 1
    ) c on c.day = d::date
    order by 1;
end;
$$;

create or replace function public.admin_subscription_growth(p_days int default 30)
returns table (day date, new_pro int, cancelled int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select d::date,
           coalesce(np.n, 0)::int,
           coalesce(cx.n, 0)::int
    from generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day') d
    left join (
      select l.created_at::date as day, count(*) as n
      from public.admin_audit_logs l where l.action = 'PLAN_CHANGED'
      group by 1
    ) np on np.day = d::date
    left join (
      select l.created_at::date as day, count(*) as n
      from public.admin_audit_logs l where l.action = 'SUBSCRIPTION_CANCELLED'
      group by 1
    ) cx on cx.day = d::date
    order by 1;
end;
$$;

grant execute on function public.admin_get_dashboard_stats() to authenticated;
grant execute on function public.admin_user_growth(int) to authenticated;
grant execute on function public.admin_subscription_growth(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Admin/role management. Extremely careful with the last super_admin.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_admins()
returns table (user_id uuid, email text, full_name text, role text, granted_at timestamptz, granted_by uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select r.user_id, u.email, p.full_name, r.role, r.created_at, r.created_by
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    join public.profiles p on p.id = r.user_id
    order by r.role, r.created_at;
end;
$$;

create or replace function public.admin_grant_role(p_user uuid, p_role text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_super_admin();
  if p_role not in ('admin', 'super_admin') then raise exception 'Invalid role'; end if;

  insert into public.user_roles (user_id, role, created_by)
    values (p_user, p_role, auth.uid())
    on conflict (user_id, role) do nothing;

  perform public._log_admin_action('ROLE_GRANTED', p_user, 'user_roles', p_user,
    jsonb_build_object('role', p_role, 'reason', p_reason));
end;
$$;

create or replace function public.admin_revoke_role(p_user uuid, p_role text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_remaining int;
begin
  perform public.require_super_admin();
  if p_role not in ('admin', 'super_admin') then raise exception 'Invalid role'; end if;

  if p_role = 'super_admin' then
    select count(*) into v_remaining from public.user_roles where role = 'super_admin';
    if v_remaining <= 1 and public.has_role(p_user, 'super_admin') then
      raise exception 'Cannot remove the last Super Admin';
    end if;
  end if;

  delete from public.user_roles where user_id = p_user and role = p_role;

  perform public._log_admin_action('ROLE_REVOKED', p_user, 'user_roles', p_user,
    jsonb_build_object('role', p_role, 'reason', p_reason));
end;
$$;

grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_grant_role(uuid, text, text) to authenticated;
grant execute on function public.admin_revoke_role(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================================
-- First Super Admin — manual, one-time setup. NOT exposed anywhere in the
-- app UI. Run this once in the Supabase SQL editor, replacing the email:
--
--   insert into public.user_roles (user_id, role)
--   select id, 'super_admin' from auth.users where email = 'YOUR_ADMIN_EMAIL'
--   on conflict (user_id, role) do nothing;
--
-- Verify with:  select * from public.user_roles;
-- =========================================================================


-- ============================================================
-- 025_admin_users_left_join.sql
-- ============================================================
-- 025_admin_users_left_join.sql
-- =========================================================================
-- Fix: admin_list_users / admin_get_user_details / admin_list_subscriptions /
-- admin_list_admins used an INNER join to public.profiles. Since a profile
-- row can legitimately be missing (the regular app already tolerates this —
-- see useProfile()'s synthesized fallback), any account without one was
-- silently dropped from every admin list, including the currently signed-in
-- super admin. No error was raised — the queries just returned fewer rows,
-- which is why the previous error-state fix didn't surface anything.
--
-- Fix: (1) backfill any missing profiles rows the same way handle_new_user()
-- (001) already does for new signups, and (2) switch these RPCs to LEFT JOIN
-- with coalesced fallbacks, so an account is never excluded just because its
-- profile row is missing.
-- =========================================================================

-- 1. Backfill — idempotent, mirrors handle_new_user().
insert into public.profiles (id, email, full_name, avatar_url)
select u.id, u.email,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
       u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 2. admin_list_users — LEFT JOIN profiles.
create or replace function public.admin_list_users(
  p_search text default null,
  p_plan_slug text default null,
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  user_id uuid, email text, full_name text, avatar_url text, status text,
  created_at timestamptz, plan_slug text, plan_name text, subscription_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email, p.full_name, p.avatar_url,
           coalesce(p.status, 'active'),
           coalesce(p.created_at, u.created_at),
           sp.slug, sp.name, us.status,
           count(*) over ()::bigint
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%')
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
      and (p_status is null or p_status = '' or coalesce(p.status, 'active') = p_status)
    order by coalesce(p.created_at, u.created_at) desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

-- 3. admin_get_user_details — LEFT JOIN profiles.
create or replace function public.admin_get_user_details(p_user uuid)
returns table (
  user_id uuid, email text, full_name text, avatar_url text, status text, created_at timestamptz,
  last_sign_in_at timestamptz,
  plan_slug text, plan_name text, subscription_status text, billing_cycle text,
  current_period_end timestamptz, cancel_at_period_end boolean, trial_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email, p.full_name, p.avatar_url,
           coalesce(p.status, 'active'), coalesce(p.created_at, u.created_at), u.last_sign_in_at,
           sp.slug, sp.name, us.status, us.billing_cycle,
           us.current_period_end, us.cancel_at_period_end, us.trial_end
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where u.id = p_user;
end;
$$;

-- 4. admin_list_subscriptions — LEFT JOIN profiles (a subscription can exist
--    for a user whose profile row is missing).
create or replace function public.admin_list_subscriptions(
  p_status text default null,
  p_plan_slug text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  subscription_id uuid, user_id uuid, email text, full_name text,
  plan_slug text, plan_name text, price_monthly numeric, price_yearly numeric,
  status text, billing_cycle text, current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean, provider text, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select us.id, us.user_id, u.email, p.full_name,
           sp.slug, sp.name, sp.price_monthly, sp.price_yearly,
           us.status, us.billing_cycle, us.current_period_start, us.current_period_end,
           us.cancel_at_period_end, us.provider, us.created_at,
           count(*) over ()::bigint
    from public.user_subscriptions us
    join auth.users u on u.id = us.user_id
    left join public.profiles p on p.id = us.user_id
    join public.subscription_plans sp on sp.id = us.plan_id
    where (p_status is null or p_status = '' or us.status = p_status)
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
    order by us.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

-- 5. admin_list_admins — LEFT JOIN profiles (an admin's own profile row
--    should never hide them from the admin roster).
create or replace function public.admin_list_admins()
returns table (user_id uuid, email text, full_name text, role text, granted_at timestamptz, granted_by uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select r.user_id, u.email, p.full_name, r.role, r.created_at, r.created_by
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    order by r.role, r.created_at;
end;
$$;

notify pgrst, 'reload schema';


-- ============================================================
-- 026_admin_email_cast_fix.sql
-- ============================================================
-- 026_admin_email_cast_fix.sql
-- =========================================================================
-- Fix: auth.users.email is `character varying(255)`, not `text`. PL/pgSQL's
-- RETURN QUERY requires an EXACT type match against the function's declared
-- RETURNS TABLE column types (no implicit varchar -> text coercion), so
-- every admin RPC that selects u.email/au.email/tu.email into an `email
-- text` output column failed with:
--   42804  structure of query does not match function result type
--   Returned type character varying(255) does not match expected type text
--
-- Fix: cast every auth.users email reference to ::text. No behavioural or
-- signature change otherwise — same left-join fix from 025 is preserved.
-- =========================================================================

create or replace function public.admin_list_users(
  p_search text default null,
  p_plan_slug text default null,
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  user_id uuid, email text, full_name text, avatar_url text, status text,
  created_at timestamptz, plan_slug text, plan_name text, subscription_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email::text, p.full_name, p.avatar_url,
           coalesce(p.status, 'active'),
           coalesce(p.created_at, u.created_at),
           sp.slug, sp.name, us.status,
           count(*) over ()::bigint
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%')
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
      and (p_status is null or p_status = '' or coalesce(p.status, 'active') = p_status)
    order by coalesce(p.created_at, u.created_at) desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_get_user_details(p_user uuid)
returns table (
  user_id uuid, email text, full_name text, avatar_url text, status text, created_at timestamptz,
  last_sign_in_at timestamptz,
  plan_slug text, plan_name text, subscription_status text, billing_cycle text,
  current_period_end timestamptz, cancel_at_period_end boolean, trial_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email::text, p.full_name, p.avatar_url,
           coalesce(p.status, 'active'), coalesce(p.created_at, u.created_at), u.last_sign_in_at,
           sp.slug, sp.name, us.status, us.billing_cycle,
           us.current_period_end, us.cancel_at_period_end, us.trial_end
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_subscriptions us on us.user_id = u.id
    left join public.subscription_plans sp on sp.id = us.plan_id
    where u.id = p_user;
end;
$$;

create or replace function public.admin_list_subscriptions(
  p_status text default null,
  p_plan_slug text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  subscription_id uuid, user_id uuid, email text, full_name text,
  plan_slug text, plan_name text, price_monthly numeric, price_yearly numeric,
  status text, billing_cycle text, current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean, provider text, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select us.id, us.user_id, u.email::text, p.full_name,
           sp.slug, sp.name, sp.price_monthly, sp.price_yearly,
           us.status, us.billing_cycle, us.current_period_start, us.current_period_end,
           us.cancel_at_period_end, us.provider, us.created_at,
           count(*) over ()::bigint
    from public.user_subscriptions us
    join auth.users u on u.id = us.user_id
    left join public.profiles p on p.id = us.user_id
    join public.subscription_plans sp on sp.id = us.plan_id
    where (p_status is null or p_status = '' or us.status = p_status)
      and (p_plan_slug is null or p_plan_slug = '' or sp.slug = p_plan_slug)
    order by us.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_list_admins()
returns table (user_id uuid, email text, full_name text, role text, granted_at timestamptz, granted_by uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select r.user_id, u.email::text, p.full_name, r.role, r.created_at, r.created_by
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    order by r.role, r.created_at;
end;
$$;

create or replace function public.admin_list_payments(
  p_event_type text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  event_id uuid, user_id uuid, email text, event_type text, provider_event_id text,
  payload jsonb, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select e.id, e.user_id, u.email::text, e.event_type, e.provider_event_id, e.payload, e.created_at,
           count(*) over ()::bigint
    from public.subscription_events e
    left join auth.users u on u.id = e.user_id
    where p_event_type is null or p_event_type = '' or e.event_type = p_event_type
    order by e.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_list_audit_logs(
  p_admin_user uuid default null,
  p_action text default null,
  p_target_user uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  log_id uuid, admin_user_id uuid, admin_email text, action text,
  target_user_id uuid, target_email text, resource_type text, resource_id uuid,
  metadata jsonb, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select l.id, l.admin_user_id, au.email::text, l.action, l.target_user_id, tu.email::text,
           l.resource_type, l.resource_id, l.metadata, l.created_at,
           count(*) over ()::bigint
    from public.admin_audit_logs l
    left join auth.users au on au.id = l.admin_user_id
    left join auth.users tu on tu.id = l.target_user_id
    where (p_admin_user is null or l.admin_user_id = p_admin_user)
      and (p_action is null or p_action = '' or l.action = p_action)
      and (p_target_user is null or l.target_user_id = p_target_user)
      and (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at <= p_to)
    order by l.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

notify pgrst, 'reload schema';


-- ============================================================
-- 027_custom_plan_requests.sql
-- ============================================================
-- 027_custom_plan_requests.sql
-- =========================================================================
-- Custom Plan / Request a Quote.
--
--   User submits requirements -> custom_plan_requests (pending)
--   Admin reviews -> creates a draft quote -> sends it -> custom_plan_quotes (sent)
--   User accepts -> quote/request -> payment_pending (NO activation yet)
--   Razorpay subscription created (quote_id -> DB price, never a client amount)
--   subscription-webhook confirms payment -> THIS is what activates it
--
-- Design choice: a sent quote materialises a normal, inactive
-- subscription_plans row (name/price/limits/features copied from the quote).
-- Once activated, user_subscriptions.plan_id simply points at that row —
-- which means get_my_subscription(), get_subscription_usage(),
-- enforce_subscription_limit(), FeatureGate, PlanBadge and the admin
-- subscriptions list ALL already understand a custom plan with zero changes,
-- because they only ever look at plan_id -> subscription_plans.limits/
-- features. user_subscriptions.custom_quote_id is purely a traceability
-- pointer back to the quote/request that produced it; nothing reads it for
-- entitlement decisions. There is no second limit system and no parallel
-- subscription table.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Requests.
-- ---------------------------------------------------------------------------
create table if not exists public.custom_plan_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in (
    'pending', 'reviewing', 'quoted', 'accepted', 'payment_pending', 'active',
    'rejected', 'expired', 'cancelled', 'payment_failed'
  )),
  requested_accounts int check (requested_accounts is null or requested_accounts between 0 and 100000),
  requested_transactions_per_month int check (requested_transactions_per_month is null or requested_transactions_per_month between 0 and 1000000),
  requested_budgets int check (requested_budgets is null or requested_budgets between 0 and 100000),
  requested_bills int check (requested_bills is null or requested_bills between 0 and 100000),
  requested_lending_records int check (requested_lending_records is null or requested_lending_records between 0 and 100000),
  requested_features jsonb not null default '{}'::jsonb,
  billing_preference text not null default 'either' check (billing_preference in ('monthly', 'yearly', 'either')),
  additional_requirements text check (additional_requirements is null or char_length(additional_requirements) <= 2000),
  admin_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_requests_user on public.custom_plan_requests (user_id, created_at desc);
create index if not exists idx_custom_requests_status on public.custom_plan_requests (status);

-- ---------------------------------------------------------------------------
-- 2. Quotes. One request can accumulate several quotes over time (a rejected
--    or expired quote just means the admin issues a new one) — history is
--    never overwritten, only superseded.
-- ---------------------------------------------------------------------------
create table if not exists public.custom_plan_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.custom_plan_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_name text not null,
  monthly_price numeric(10,2) not null check (monthly_price >= 0),
  yearly_price numeric(10,2) not null check (yearly_price >= 0),
  currency text not null default 'INR',
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  quote_message text,
  valid_until timestamptz not null,
  status text not null default 'draft' check (status in (
    'draft', 'sent', 'accepted', 'expired', 'rejected', 'cancelled',
    'payment_pending', 'paid', 'active'
  )),
  subscription_plan_id uuid references public.subscription_plans(id) on delete set null,
  razorpay_monthly_plan_id text,
  razorpay_yearly_plan_id text,
  razorpay_subscription_id text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_quotes_request on public.custom_plan_quotes (request_id, created_at desc);
create index if not exists idx_custom_quotes_user on public.custom_plan_quotes (user_id, status);
create index if not exists idx_custom_quotes_razorpay_sub
  on public.custom_plan_quotes (razorpay_subscription_id) where razorpay_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Trace a custom subscription back to the quote that produced it. Not
--    used for entitlement decisions (plan_id already carries the real
--    limits/features) — purely for admin/user UI ("this Pro-priced row is
--    actually your custom plan from request X").
-- ---------------------------------------------------------------------------
alter table public.user_subscriptions
  add column if not exists custom_quote_id uuid references public.custom_plan_quotes(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. RLS. Users never see another user's request/quote, never see a DRAFT
--    quote (that's an admin-only working state), and cannot write to either
--    table directly — every transition goes through a SECURITY DEFINER RPC.
-- ---------------------------------------------------------------------------
alter table public.custom_plan_requests enable row level security;
drop policy if exists "own_or_admin_select" on public.custom_plan_requests;
create policy "own_or_admin_select" on public.custom_plan_requests
  for select using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.custom_plan_requests from authenticated, anon;

alter table public.custom_plan_quotes enable row level security;
drop policy if exists "own_or_admin_select" on public.custom_plan_quotes;
create policy "own_or_admin_select" on public.custom_plan_quotes
  for select using ((user_id = auth.uid() and status <> 'draft') or public.is_admin());
revoke insert, update, delete on public.custom_plan_quotes from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. create_custom_plan_request(): the only way a request row is created.
--    Validates bounds, requires meaningful content, and blocks spamming
--    duplicate open requests.
-- ---------------------------------------------------------------------------
create or replace function public.create_custom_plan_request(
  p_accounts int default null,
  p_transactions_per_month int default null,
  p_budgets int default null,
  p_bills int default null,
  p_lending_records int default null,
  p_features jsonb default '{}'::jsonb,
  p_billing_preference text default 'either',
  p_additional_requirements text default null
)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.custom_plan_requests;
  v_text text := nullif(trim(coalesce(p_additional_requirements, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_billing_preference not in ('monthly', 'yearly', 'either') then
    raise exception 'Invalid billing preference';
  end if;
  if v_text is not null and char_length(v_text) > 2000 then
    v_text := left(v_text, 2000);
  end if;
  if p_accounts is null and p_transactions_per_month is null and p_budgets is null
     and p_bills is null and p_lending_records is null and v_text is null then
    raise exception 'Please tell us at least one thing you need — a limit or a description.';
  end if;
  if exists (
    select 1 from public.custom_plan_requests
    where user_id = auth.uid()
      and status in ('pending', 'reviewing', 'quoted', 'accepted', 'payment_pending')
  ) then
    raise exception 'You already have an open custom plan request.';
  end if;

  insert into public.custom_plan_requests (
    user_id, requested_accounts, requested_transactions_per_month, requested_budgets,
    requested_bills, requested_lending_records, requested_features, billing_preference,
    additional_requirements
  ) values (
    auth.uid(),
    -- GREATEST() ignores NULLs rather than propagating them, so guard each
    -- one explicitly: an unspecified field must stay NULL ("no opinion"),
    -- never get coerced to 0.
    case when p_accounts is null then null else greatest(0, p_accounts) end,
    case when p_transactions_per_month is null then null else greatest(0, p_transactions_per_month) end,
    case when p_budgets is null then null else greatest(0, p_budgets) end,
    case when p_bills is null then null else greatest(0, p_bills) end,
    case when p_lending_records is null then null else greatest(0, p_lending_records) end,
    coalesce(p_features, '{}'::jsonb),
    p_billing_preference, v_text
  ) returning * into v_req;

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (auth.uid(), 'custom_plan_request_submitted', 'Your custom plan request has been submitted',
          'Our team will review it and get back to you with a quote.', 'success', v_req.id);

  return v_req;
end;
$$;

grant execute on function public.create_custom_plan_request(int, int, int, int, int, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Opportunistic expiry (mirrors refresh_lending_schedule_status /
--    process_my_recurring): the caller's own sent quotes past valid_until
--    flip to 'expired'. accept_custom_plan_quote() also re-checks expiry
--    defensively, so this is a UX freshener, not the only guard.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_custom_quotes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.custom_plan_quotes
    set status = 'expired', updated_at = now()
    where user_id = auth.uid() and status = 'sent' and valid_until < now();
end;
$$;

grant execute on function public.expire_stale_custom_quotes() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. accept_custom_plan_quote(): STEP 1-8 of Phase 10. Never activates
--    anything — only proves ownership/validity and marks payment_pending so
--    the Edge Function (which actually talks to Razorpay) has a green light.
--    Idempotent: a double-click / two tabs safely returns the same state
--    instead of erroring or double-processing.
-- ---------------------------------------------------------------------------
create or replace function public.accept_custom_plan_quote(p_quote_id uuid)
returns public.custom_plan_quotes
language plpgsql
security definer
set search_path = public
as $$
declare v_quote public.custom_plan_quotes;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_quote from public.custom_plan_quotes
    where id = p_quote_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'Quote not found';
  end if;

  -- Idempotent no-op for a retry/second tab hitting an already-accepted quote.
  if v_quote.status in ('payment_pending', 'paid', 'active') then
    return v_quote;
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'This quote is no longer available (%).', v_quote.status;
  end if;
  if v_quote.valid_until < now() then
    update public.custom_plan_quotes set status = 'expired', updated_at = now() where id = v_quote.id;
    raise exception 'This quote has expired';
  end if;
  if v_quote.monthly_price < 0 or v_quote.yearly_price < 0 then
    raise exception 'Quote has an invalid price';
  end if;

  update public.custom_plan_quotes
    set status = 'payment_pending', updated_at = now()
    where id = v_quote.id
    returning * into v_quote;

  update public.custom_plan_requests
    set status = 'payment_pending', updated_at = now()
    where id = v_quote.request_id;

  perform public._log_admin_action('CUSTOM_PLAN_QUOTE_ACCEPTED', auth.uid(), 'custom_plan_quotes', v_quote.id, '{}'::jsonb);

  return v_quote;
end;
$$;

grant execute on function public.accept_custom_plan_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. reject_custom_plan_quote(): the user's "Decline". Request status is
--    left as-is (still 'quoted') so an admin can issue a fresh quote without
--    losing the history of what was declined.
-- ---------------------------------------------------------------------------
create or replace function public.reject_custom_plan_quote(p_quote_id uuid)
returns public.custom_plan_quotes
language plpgsql
security definer
set search_path = public
as $$
declare v_quote public.custom_plan_quotes;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_quote from public.custom_plan_quotes
    where id = p_quote_id and user_id = auth.uid()
    for update;
  if not found then raise exception 'Quote not found'; end if;
  if v_quote.status <> 'sent' then
    raise exception 'This quote can no longer be declined (%).', v_quote.status;
  end if;

  update public.custom_plan_quotes set status = 'rejected', updated_at = now()
    where id = v_quote.id returning * into v_quote;

  perform public._log_admin_action('CUSTOM_PLAN_QUOTE_REJECTED', auth.uid(), 'custom_plan_quotes', v_quote.id, '{}'::jsonb);

  return v_quote;
end;
$$;

grant execute on function public.reject_custom_plan_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Admin: list / detail.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_custom_plan_requests(
  p_status text default null,
  p_search text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  request_id uuid, user_id uuid, email text, full_name text, status text,
  requested_accounts int, requested_transactions_per_month int, requested_budgets int,
  requested_bills int, requested_lending_records int, billing_preference text,
  latest_quote_status text, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select r.id, r.user_id, u.email::text, p.full_name, r.status,
           r.requested_accounts, r.requested_transactions_per_month, r.requested_budgets,
           r.requested_bills, r.requested_lending_records, r.billing_preference,
           (select q.status from public.custom_plan_quotes q
              where q.request_id = r.id order by q.created_at desc limit 1),
           r.created_at,
           count(*) over ()::bigint
    from public.custom_plan_requests r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    where (p_status is null or p_status = '' or r.status = p_status)
      and (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%')
    order by r.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_get_custom_plan_request(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'request', to_jsonb(r) || jsonb_build_object('email', u.email::text, 'full_name', p.full_name),
    'quotes', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.created_at desc)
      from public.custom_plan_quotes q where q.request_id = r.id
    ), '[]'::jsonb)
  ) into v_result
  from public.custom_plan_requests r
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  where r.id = p_request_id;

  if v_result is null then raise exception 'Request not found'; end if;
  return v_result;
end;
$$;

grant execute on function public.admin_list_custom_plan_requests(text, text, int, int) to authenticated;
grant execute on function public.admin_get_custom_plan_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Admin: review / quote / send / reject lifecycle.
-- ---------------------------------------------------------------------------
create or replace function public.admin_start_custom_plan_review(p_request_id uuid)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  perform public.require_admin();
  update public.custom_plan_requests
    set status = 'reviewing', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = p_request_id and status = 'pending'
    returning * into v_req;
  if not found then raise exception 'Request not found or not pending'; end if;

  perform public._log_admin_action('CUSTOM_PLAN_REQUEST_REVIEWED', v_req.user_id, 'custom_plan_requests', v_req.id, '{}'::jsonb);
  return v_req;
end;
$$;

create or replace function public.admin_reject_custom_plan_request(p_request_id uuid, p_reason text default null)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  perform public.require_admin();
  update public.custom_plan_requests
    set status = 'rejected', admin_notes = coalesce(p_reason, admin_notes), updated_at = now()
    where id = p_request_id and status in ('pending', 'reviewing', 'quoted')
    returning * into v_req;
  if not found then raise exception 'Request not found or cannot be rejected in its current state'; end if;

  update public.custom_plan_quotes set status = 'cancelled', updated_at = now()
    where request_id = v_req.id and status in ('draft', 'sent');

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (v_req.user_id, 'custom_plan_request_rejected', 'Your custom plan request was declined',
          coalesce(p_reason, 'Please reach out to support if you have questions.'), 'warning', v_req.id);

  perform public._log_admin_action('CUSTOM_PLAN_REQUEST_REJECTED', v_req.user_id, 'custom_plan_requests', v_req.id,
    jsonb_build_object('reason', p_reason));
  return v_req;
end;
$$;

create or replace function public.admin_create_custom_plan_quote(
  p_request_id uuid, p_plan_name text, p_monthly_price numeric, p_yearly_price numeric,
  p_currency text, p_limits jsonb, p_features jsonb, p_quote_message text, p_valid_until timestamptz
)
returns public.custom_plan_quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.custom_plan_requests;
  v_quote public.custom_plan_quotes;
begin
  perform public.require_admin();

  select * into v_req from public.custom_plan_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status not in ('pending', 'reviewing', 'quoted', 'rejected') then
    raise exception 'Cannot quote a request in status %', v_req.status;
  end if;
  if p_monthly_price < 0 or p_yearly_price < 0 then raise exception 'Price cannot be negative'; end if;
  if trim(coalesce(p_plan_name, '')) = '' then raise exception 'Plan name is required'; end if;
  if p_valid_until <= now() then raise exception 'Valid-until date must be in the future'; end if;

  insert into public.custom_plan_quotes (
    request_id, user_id, plan_name, monthly_price, yearly_price, currency,
    limits, features, quote_message, valid_until, created_by
  ) values (
    v_req.id, v_req.user_id, trim(p_plan_name), p_monthly_price, p_yearly_price,
    coalesce(nullif(p_currency, ''), 'INR'), coalesce(p_limits, '{}'::jsonb),
    coalesce(p_features, '{}'::jsonb), p_quote_message, p_valid_until, auth.uid()
  ) returning * into v_quote;

  perform public._log_admin_action('CUSTOM_PLAN_QUOTE_CREATED', v_req.user_id, 'custom_plan_quotes', v_quote.id, '{}'::jsonb);
  return v_quote;
end;
$$;

create or replace function public.admin_update_custom_plan_quote(
  p_quote_id uuid, p_plan_name text, p_monthly_price numeric, p_yearly_price numeric,
  p_currency text, p_limits jsonb, p_features jsonb, p_quote_message text, p_valid_until timestamptz
)
returns public.custom_plan_quotes
language plpgsql
security definer
set search_path = public
as $$
declare v_quote public.custom_plan_quotes;
begin
  perform public.require_admin();

  select * into v_quote from public.custom_plan_quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found'; end if;
  if v_quote.status <> 'draft' then
    raise exception 'Only a draft quote can be edited';
  end if;
  if p_monthly_price < 0 or p_yearly_price < 0 then raise exception 'Price cannot be negative'; end if;
  if trim(coalesce(p_plan_name, '')) = '' then raise exception 'Plan name is required'; end if;
  if p_valid_until <= now() then raise exception 'Valid-until date must be in the future'; end if;

  update public.custom_plan_quotes set
    plan_name = trim(p_plan_name), monthly_price = p_monthly_price, yearly_price = p_yearly_price,
    currency = coalesce(nullif(p_currency, ''), 'INR'), limits = coalesce(p_limits, '{}'::jsonb),
    features = coalesce(p_features, '{}'::jsonb), quote_message = p_quote_message,
    valid_until = p_valid_until, updated_at = now()
  where id = p_quote_id
  returning * into v_quote;

  perform public._log_admin_action('CUSTOM_PLAN_QUOTE_UPDATED', v_quote.user_id, 'custom_plan_quotes', v_quote.id, '{}'::jsonb);
  return v_quote;
end;
$$;

-- Sending a quote is the moment its terms become locked-in and real: it
-- materialises an (inactive) subscription_plans row so the rest of the
-- subscription system can recognise it the instant it's paid for.
create or replace function public.admin_send_custom_plan_quote(p_quote_id uuid)
returns public.custom_plan_quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.custom_plan_quotes;
  v_plan_id uuid;
begin
  perform public.require_admin();

  select * into v_quote from public.custom_plan_quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found'; end if;
  if v_quote.status <> 'draft' then raise exception 'Quote has already been sent'; end if;

  insert into public.subscription_plans (name, slug, description, price_monthly, price_yearly, currency, features, limits, is_active, sort_order)
  values (
    v_quote.plan_name, 'custom-' || v_quote.id, 'Custom plan', v_quote.monthly_price, v_quote.yearly_price,
    v_quote.currency, v_quote.features, v_quote.limits, false, 99
  )
  returning id into v_plan_id;

  update public.custom_plan_quotes
    set status = 'sent', subscription_plan_id = v_plan_id, updated_at = now()
    where id = v_quote.id
    returning * into v_quote;

  update public.custom_plan_requests set status = 'quoted', updated_at = now() where id = v_quote.request_id;

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (v_quote.user_id, 'custom_plan_quote_ready', 'Your custom plan quote is ready',
          v_quote.plan_name || ' — review and accept it from Settings > Subscription.', 'info', v_quote.id);

  perform public._log_admin_action('CUSTOM_PLAN_QUOTE_SENT', v_quote.user_id, 'custom_plan_quotes', v_quote.id, '{}'::jsonb);
  return v_quote;
end;
$$;

grant execute on function public.admin_start_custom_plan_review(uuid) to authenticated;
grant execute on function public.admin_reject_custom_plan_request(uuid, text) to authenticated;
grant execute on function public.admin_create_custom_plan_quote(uuid, text, numeric, numeric, text, jsonb, jsonb, text, timestamptz) to authenticated;
grant execute on function public.admin_update_custom_plan_quote(uuid, text, numeric, numeric, text, jsonb, jsonb, text, timestamptz) to authenticated;
grant execute on function public.admin_send_custom_plan_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. admin_list_subscriptions: teach it to filter on a synthetic 'custom'
--     plan_slug (every custom plan's real slug is `custom-<quote id>`).
--     Same signature, same behaviour for 'free'/'pro'/empty — additive only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_subscriptions(
  p_status text default null,
  p_plan_slug text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  subscription_id uuid, user_id uuid, email text, full_name text,
  plan_slug text, plan_name text, price_monthly numeric, price_yearly numeric,
  status text, billing_cycle text, current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean, provider text, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select us.id, us.user_id, u.email::text, p.full_name,
           sp.slug, sp.name, sp.price_monthly, sp.price_yearly,
           us.status, us.billing_cycle, us.current_period_start, us.current_period_end,
           us.cancel_at_period_end, us.provider, us.created_at,
           count(*) over ()::bigint
    from public.user_subscriptions us
    join auth.users u on u.id = us.user_id
    left join public.profiles p on p.id = us.user_id
    join public.subscription_plans sp on sp.id = us.plan_id
    where (p_status is null or p_status = '' or us.status = p_status)
      and (
        p_plan_slug is null or p_plan_slug = ''
        or (p_plan_slug = 'custom' and sp.slug like 'custom-%')
        or sp.slug = p_plan_slug
      )
    order by us.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Realtime — so a submitted request / sent quote reflects live.
-- ---------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.custom_plan_requests;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.custom_plan_quotes;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';


-- ============================================================
-- 027_custom_plan_requests.sql
-- ============================================================
-- 027_custom_plan_requests.sql
-- =========================================================================
-- Custom Plan / Request-a-Quote system.
--
-- ONE table serves both ways an offer can come to exist:
--   offer_source = 'user_request' -> customer asked for a quote; admin
--                                    accepts their price or counters.
--   offer_source = 'admin_direct' -> admin creates the offer from scratch
--                                    for a chosen customer, who never asked.
--
-- Negotiation happens over WhatsApp (never stored); the database row is
-- always the single source of truth for the price Razorpay is ever told to
-- charge. Activation happens ONLY via the existing subscription-webhook
-- Edge Function after Razorpay confirms payment — never on the strength of
-- a click, a redirect, or anything the browser says.
--
-- Reuses rather than duplicates: subscription_plans / user_subscriptions /
-- subscription_events (a "custom" plan row is added so useSubscription() /
-- useSubscriptionLimits() / FeatureGate keep working unchanged), the
-- existing admin role system (require_admin), admin_audit_logs, and the
-- alerts table for notifications.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------
create table if not exists public.custom_plan_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_source text not null default 'user_request' check (offer_source in ('user_request', 'admin_direct')),
  requested_price numeric(10,2) check (requested_price is null or requested_price > 0),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  description text,
  additional_requirements text,
  admin_price numeric(10,2) check (admin_price is null or admin_price > 0),
  admin_message text,
  status text not null default 'pending' check (
    status in ('pending', 'reviewing', 'offered', 'payment_pending', 'active', 'declined', 'rejected', 'cancelled', 'expired')
  ),
  valid_until timestamptz,
  provider text,
  provider_subscription_id text,
  created_by uuid references auth.users(id),
  handled_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_plan_requests_user on public.custom_plan_requests (user_id, created_at desc);
create index if not exists idx_custom_plan_requests_status on public.custom_plan_requests (status);

-- ---------------------------------------------------------------------------
-- 2. RLS.
--    A user may SELECT only their own rows (own_request OR admin_direct
--    offers addressed to them — same policy, since it's just user_id).
--    A user may INSERT only a plain, self-owned, un-priced pending request —
--    the WITH CHECK clause is the entire enforcement for "cannot set
--    admin_price / status / offer_source" on insert.
--    All other writes (admin responses, direct offers, price edits,
--    accept/decline, cancellation) go through SECURITY DEFINER RPCs below,
--    so UPDATE/DELETE are revoked from the client entirely.
-- ---------------------------------------------------------------------------
alter table public.custom_plan_requests enable row level security;

drop policy if exists "own_select" on public.custom_plan_requests;
create policy "own_select" on public.custom_plan_requests
  for select using (user_id = auth.uid());

drop policy if exists "admin_select_all" on public.custom_plan_requests;
create policy "admin_select_all" on public.custom_plan_requests
  for select using (public.is_admin());

drop policy if exists "own_insert_request" on public.custom_plan_requests;
create policy "own_insert_request" on public.custom_plan_requests
  for insert with check (
    user_id = auth.uid()
    and offer_source = 'user_request'
    and status = 'pending'
    and admin_price is null
    and provider is null
    and provider_subscription_id is null
  );

revoke update, delete on public.custom_plan_requests from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. A "custom" plan row so an activated custom subscription is a completely
--    normal Pro-equivalent plan as far as useSubscription() / FeatureGate /
--    limit enforcement are concerned. The actual negotiated price a user
--    pays lives on their own custom_plan_requests row, never here (this row
--    is shared across every custom-plan customer).
-- ---------------------------------------------------------------------------
insert into public.subscription_plans (name, slug, description, price_monthly, price_yearly, sort_order, is_active, features, limits)
select
  'Custom', 'custom', 'A negotiated plan tailored to one customer''s needs.',
  0, 0, 2, false, -- is_active = false: never shown on the public Pricing page
  pro.features, pro.limits
from public.subscription_plans pro
where pro.slug = 'pro'
  and not exists (select 1 from public.subscription_plans where slug = 'custom');

-- ---------------------------------------------------------------------------
-- 4. User-facing: request a quote is a direct insert (RLS-enforced, see
--    above) — no RPC needed. Decline / Accept are RPCs because they must be
--    re-validated server-side (status, ownership, expiry) before anything
--    is allowed to happen.
-- ---------------------------------------------------------------------------
create or replace function public.decline_custom_plan_offer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from public.custom_plan_requests
    where id = p_id and user_id = auth.uid()
    for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_status <> 'offered' then raise exception 'This offer can no longer be declined'; end if;

  update public.custom_plan_requests
    set status = 'declined', updated_at = now()
    where id = p_id;
end;
$$;

-- Flips to payment_pending only. The actual Razorpay order/subscription is
-- created by the create-custom-plan-checkout Edge Function AFTER this
-- succeeds, reading admin_price fresh from this same row — the frontend
-- never passes a price anywhere in this sequence.
create or replace function public.accept_custom_plan_offer(p_id uuid)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  select * into v_req from public.custom_plan_requests
    where id = p_id and user_id = auth.uid()
    for update;
  if not found then raise exception 'Offer not found'; end if;

  if v_req.valid_until is not null and v_req.valid_until < now() and v_req.status = 'offered' then
    update public.custom_plan_requests set status = 'expired', updated_at = now() where id = p_id;
    raise exception 'This offer has expired';
  end if;
  if v_req.status <> 'offered' then
    raise exception 'This offer is no longer available';
  end if;

  update public.custom_plan_requests
    set status = 'payment_pending', updated_at = now()
    where id = p_id
    returning * into v_req;
  return v_req;
end;
$$;

grant execute on function public.decline_custom_plan_offer(uuid) to authenticated;
grant execute on function public.accept_custom_plan_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin: respond to a request, reject it, create a direct offer, edit an
--    offered price (same path serves WhatsApp-negotiated re-pricing for
--    EITHER offer_source), cancel, and list/inspect.
-- ---------------------------------------------------------------------------
create or replace function public.admin_respond_custom_plan_request(
  p_id uuid, p_admin_price numeric, p_billing_cycle text, p_admin_message text default null,
  p_valid_until timestamptz default null, p_reason text default null
)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.custom_plan_requests;
  v_action text;
begin
  perform public.require_admin();
  if p_admin_price is null or p_admin_price <= 0 then raise exception 'Price must be greater than zero'; end if;
  if p_billing_cycle not in ('monthly', 'yearly') then raise exception 'Invalid billing cycle'; end if;

  select * into v_req from public.custom_plan_requests where id = p_id and offer_source = 'user_request' for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status not in ('pending', 'reviewing') then raise exception 'This request has already been responded to'; end if;

  update public.custom_plan_requests set
    admin_price = p_admin_price, billing_cycle = p_billing_cycle, admin_message = p_admin_message,
    valid_until = p_valid_until, status = 'offered', handled_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_req;

  v_action := case when v_req.requested_price is not null and v_req.requested_price = p_admin_price
                    then 'CUSTOM_PLAN_PRICE_ACCEPTED' else 'CUSTOM_PLAN_COUNTER_OFFER_SENT' end;
  perform public._log_admin_action(v_action, v_req.user_id, 'custom_plan_requests', v_req.id,
    jsonb_build_object('requested_price', v_req.requested_price, 'admin_price', p_admin_price, 'reason', p_reason));

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (v_req.user_id, 'CUSTOM_PLAN_OFFER_READY', 'Your custom plan offer is ready',
          format('%s/%s', p_admin_price, p_billing_cycle), 'success', v_req.id);

  return v_req;
end;
$$;

create or replace function public.admin_reject_custom_plan_request(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  perform public.require_admin();
  select * into v_req from public.custom_plan_requests where id = p_id and offer_source = 'user_request' for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status not in ('pending', 'reviewing') then raise exception 'This request has already been handled'; end if;

  update public.custom_plan_requests
    set status = 'rejected', handled_by = auth.uid(), updated_at = now()
    where id = p_id;

  perform public._log_admin_action('CUSTOM_PLAN_REQUEST_REJECTED', v_req.user_id, 'custom_plan_requests', p_id,
    jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_create_custom_offer(
  p_user uuid, p_price numeric, p_billing_cycle text, p_description text,
  p_admin_message text default null, p_valid_until timestamptz default null
)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  perform public.require_admin();
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'Customer not found'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Price must be greater than zero'; end if;
  if p_billing_cycle not in ('monthly', 'yearly') then raise exception 'Invalid billing cycle'; end if;
  if p_description is null or length(trim(p_description)) = 0 then raise exception 'Description is required'; end if;

  insert into public.custom_plan_requests (
    user_id, offer_source, requested_price, billing_cycle, description, admin_price, admin_message,
    status, valid_until, created_by, handled_by
  ) values (
    p_user, 'admin_direct', null, p_billing_cycle, p_description, p_price, p_admin_message,
    'offered', p_valid_until, auth.uid(), auth.uid()
  ) returning * into v_req;

  perform public._log_admin_action('CUSTOM_PLAN_DIRECT_OFFER_CREATED', p_user, 'custom_plan_requests', v_req.id,
    jsonb_build_object('admin_price', p_price, 'billing_cycle', p_billing_cycle));

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (p_user, 'CUSTOM_PLAN_DIRECT_OFFER_CREATED', 'MoneyFlow has a special offer for you',
          format('%s/%s', p_price, p_billing_cycle), 'success', v_req.id);

  return v_req;
end;
$$;

create or replace function public.admin_update_custom_offer(
  p_id uuid, p_admin_price numeric, p_admin_message text default null,
  p_valid_until timestamptz default null, p_reason text default null
)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.custom_plan_requests;
  v_old numeric;
  v_action text;
begin
  perform public.require_admin();
  if p_admin_price is null or p_admin_price <= 0 then raise exception 'Price must be greater than zero'; end if;

  select * into v_req from public.custom_plan_requests where id = p_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_req.status <> 'offered' then raise exception 'Only an offered, unpaid offer can be edited'; end if;

  v_old := v_req.admin_price;
  update public.custom_plan_requests set
    admin_price = p_admin_price, admin_message = coalesce(p_admin_message, admin_message),
    valid_until = p_valid_until, handled_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_req;

  v_action := case when v_req.offer_source = 'admin_direct'
                    then 'CUSTOM_PLAN_DIRECT_OFFER_UPDATED' else 'CUSTOM_PLAN_OFFER_PRICE_UPDATED' end;
  perform public._log_admin_action(v_action, v_req.user_id, 'custom_plan_requests', v_req.id,
    jsonb_build_object('old_price', v_old, 'new_price', p_admin_price, 'reason', p_reason));

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (v_req.user_id, 'CUSTOM_PLAN_OFFER_READY', 'Your custom plan offer has been updated',
          format('%s/%s', p_admin_price, v_req.billing_cycle), 'info', v_req.id);

  return v_req;
end;
$$;

create or replace function public.admin_cancel_custom_offer(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  perform public.require_admin();
  select * into v_req from public.custom_plan_requests where id = p_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_req.status not in ('pending', 'reviewing', 'offered', 'payment_pending') then
    raise exception 'This offer can no longer be cancelled';
  end if;

  update public.custom_plan_requests
    set status = 'cancelled', handled_by = auth.uid(), updated_at = now()
    where id = p_id;

  perform public._log_admin_action('CUSTOM_PLAN_DIRECT_OFFER_CANCELLED', v_req.user_id, 'custom_plan_requests', p_id,
    jsonb_build_object('reason', p_reason));
end;
$$;

grant execute on function public.admin_respond_custom_plan_request(uuid, numeric, text, text, timestamptz, text) to authenticated;
grant execute on function public.admin_reject_custom_plan_request(uuid, text) to authenticated;
grant execute on function public.admin_create_custom_offer(uuid, numeric, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_update_custom_offer(uuid, numeric, text, timestamptz, text) to authenticated;
grant execute on function public.admin_cancel_custom_offer(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Admin list/detail (same LEFT JOIN + ::text email-cast lessons as the
--    rest of the admin system).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_custom_plan_requests(
  p_source text default null,
  p_status text default null,
  p_search text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid, user_id uuid, email text, full_name text, offer_source text,
  requested_price numeric, admin_price numeric, billing_cycle text, status text,
  description text, valid_until timestamptz, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select c.id, c.user_id, u.email::text, p.full_name, c.offer_source,
           c.requested_price, c.admin_price, c.billing_cycle, c.status,
           c.description, c.valid_until, c.created_at,
           count(*) over ()::bigint
    from public.custom_plan_requests c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    where (p_source is null or p_source = '' or c.offer_source = p_source)
      and (p_status is null or p_status = '' or c.status = p_status)
      and (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%')
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_get_custom_plan_request(p_id uuid)
returns table (
  id uuid, user_id uuid, email text, full_name text, offer_source text,
  requested_price numeric, admin_price numeric, billing_cycle text, description text,
  additional_requirements text, admin_message text, status text, valid_until timestamptz,
  provider text, provider_subscription_id text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select c.id, c.user_id, u.email::text, p.full_name, c.offer_source,
           c.requested_price, c.admin_price, c.billing_cycle, c.description,
           c.additional_requirements, c.admin_message, c.status, c.valid_until,
           c.provider, c.provider_subscription_id, c.created_at, c.updated_at
    from public.custom_plan_requests c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    where c.id = p_id;
end;
$$;

grant execute on function public.admin_list_custom_plan_requests(text, text, text, int, int) to authenticated;
grant execute on function public.admin_get_custom_plan_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Realtime — so the offer card / admin list update live without a manual
--    refresh (mirrors user_subscriptions from 023).
-- ---------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.custom_plan_requests;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';


-- 028_contact_messages.sql
-- =========================================================================
-- Public Contact Us form submissions.
--
-- This is a write-only mailbox from the client's point of view: anyone
-- (including a logged-out visitor — the Contact page is public) may INSERT
-- a message, but only admins may ever read them. No email is invented or
-- assumed here — this only stores what the visitor typed.
-- =========================================================================

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  subject text not null check (char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 1 and 5000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_messages_created on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

-- Anyone may submit (logged-out visitors included) — no ownership check on
-- insert since there may be no authenticated user at all.
drop policy if exists "public_insert" on public.contact_messages;
create policy "public_insert" on public.contact_messages for insert with check (true);

-- Only admins may ever read a submission.
drop policy if exists "admin_select" on public.contact_messages;
create policy "admin_select" on public.contact_messages for select using (public.is_admin());

-- Table-level grants: anon must be able to INSERT (default privileges from
-- 015 only gave anon SELECT); nobody but an admin RPC/dashboard may read,
-- and nobody may edit or delete a submission from the client.
grant insert on public.contact_messages to anon, authenticated;
revoke select, update, delete on public.contact_messages from authenticated;
revoke update, delete on public.contact_messages from anon;

notify pgrst, 'reload schema';
