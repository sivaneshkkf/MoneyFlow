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
