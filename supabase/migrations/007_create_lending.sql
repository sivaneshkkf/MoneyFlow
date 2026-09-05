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
