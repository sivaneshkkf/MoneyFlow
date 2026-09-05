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
