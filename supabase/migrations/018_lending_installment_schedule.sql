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
