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
