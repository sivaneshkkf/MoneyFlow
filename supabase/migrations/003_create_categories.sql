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
