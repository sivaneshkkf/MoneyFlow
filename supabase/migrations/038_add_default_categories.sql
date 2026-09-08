-- 038: add 7 missing default expense categories — Insurance, Investments,
--      Fuel, Groceries, Rent, Mobile & Internet, Personal Care — for every
--      user, existing and new.
--
-- Icon names are all in the curated icon set (categoryIcons.js) already, so
-- they render correctly rather than falling back to the generic icon.

-- ---------------------------------------------------------------------------
-- 1. Backfill for EXISTING users — same pattern as the earlier "Loan
--    Interest" backfill: only inserts a category for a user who doesn't
--    already have one of that exact name + type (a user may have renamed or
--    deleted a same-named category on purpose; is_default only marks these
--    as app-provided, it never overwrites anything the user already has).
-- ---------------------------------------------------------------------------
insert into public.categories (user_id, name, type, icon, color, is_default)
select u.id, c.name, 'expense', c.icon, c.color, true
from auth.users u
cross join (values
  ('Insurance',          'ShieldCheck',  '#0D9488'),
  ('Investments',        'TrendingUp',   '#2563EB'),
  ('Fuel',                'Fuel',        '#EA580C'),
  ('Groceries',           'ShoppingCart','#16A34A'),
  ('Rent',                'Building2',   '#64748B'),
  ('Mobile & Internet',   'Smartphone',  '#0891B2'),
  ('Personal Care',       'Sparkles',    '#DB2777')
) as c(name, icon, color)
where not exists (
  select 1 from public.categories existing
  where existing.user_id = u.id and existing.type = 'expense' and existing.name = c.name
);

-- ---------------------------------------------------------------------------
-- 2. seed_user_defaults(): add the same 7 to what every NEW signup gets.
--    Full function body replaced (only the categories list changes).
-- ---------------------------------------------------------------------------
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
    (p_user,'Groceries','expense','ShoppingCart','#16A34A',true),
    (p_user,'Transportation','expense','Car','#3B82F6',true),
    (p_user,'Fuel','expense','Fuel','#EA580C',true),
    (p_user,'Bills','expense','ReceiptText','#F59E0B',true),
    (p_user,'Rent','expense','Building2','#64748B',true),
    (p_user,'Mobile & Internet','expense','Smartphone','#0891B2',true),
    (p_user,'Insurance','expense','ShieldCheck','#0D9488',true),
    (p_user,'Investments','expense','TrendingUp','#2563EB',true),
    (p_user,'Shopping','expense','ShoppingBag','#8B5CF6',true),
    (p_user,'Entertainment','expense','Clapperboard','#EC4899',true),
    (p_user,'Healthcare','expense','HeartPulse','#EF4444',true),
    (p_user,'Personal Care','expense','Sparkles','#DB2777',true),
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
