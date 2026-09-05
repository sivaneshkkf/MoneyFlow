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
