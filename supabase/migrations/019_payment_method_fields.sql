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
