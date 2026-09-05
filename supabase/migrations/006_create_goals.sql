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
