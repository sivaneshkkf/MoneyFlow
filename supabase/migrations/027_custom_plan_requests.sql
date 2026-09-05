-- 027_custom_plan_requests.sql
-- =========================================================================
-- Custom Plan / Request-a-Quote system.
--
-- ONE table serves both ways an offer can come to exist:
--   offer_source = 'user_request' -> customer asked for a quote; admin
--                                    accepts their price or counters.
--   offer_source = 'admin_direct' -> admin creates the offer from scratch
--                                    for a chosen customer, who never asked.
--
-- Negotiation happens over WhatsApp (never stored); the database row is
-- always the single source of truth for the price Razorpay is ever told to
-- charge. Activation happens ONLY via the existing subscription-webhook
-- Edge Function after Razorpay confirms payment — never on the strength of
-- a click, a redirect, or anything the browser says.
--
-- Reuses rather than duplicates: subscription_plans / user_subscriptions /
-- subscription_events (a "custom" plan row is added so useSubscription() /
-- useSubscriptionLimits() / FeatureGate keep working unchanged), the
-- existing admin role system (require_admin), admin_audit_logs, and the
-- alerts table for notifications.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------
create table if not exists public.custom_plan_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_source text not null default 'user_request' check (offer_source in ('user_request', 'admin_direct')),
  requested_price numeric(10,2) check (requested_price is null or requested_price > 0),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  description text,
  additional_requirements text,
  admin_price numeric(10,2) check (admin_price is null or admin_price > 0),
  admin_message text,
  status text not null default 'pending' check (
    status in ('pending', 'reviewing', 'offered', 'payment_pending', 'active', 'declined', 'rejected', 'cancelled', 'expired')
  ),
  valid_until timestamptz,
  provider text,
  provider_subscription_id text,
  created_by uuid references auth.users(id),
  handled_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_plan_requests_user on public.custom_plan_requests (user_id, created_at desc);
create index if not exists idx_custom_plan_requests_status on public.custom_plan_requests (status);

-- ---------------------------------------------------------------------------
-- 2. RLS.
--    A user may SELECT only their own rows (own_request OR admin_direct
--    offers addressed to them — same policy, since it's just user_id).
--    A user may INSERT only a plain, self-owned, un-priced pending request —
--    the WITH CHECK clause is the entire enforcement for "cannot set
--    admin_price / status / offer_source" on insert.
--    All other writes (admin responses, direct offers, price edits,
--    accept/decline, cancellation) go through SECURITY DEFINER RPCs below,
--    so UPDATE/DELETE are revoked from the client entirely.
-- ---------------------------------------------------------------------------
alter table public.custom_plan_requests enable row level security;

drop policy if exists "own_select" on public.custom_plan_requests;
create policy "own_select" on public.custom_plan_requests
  for select using (user_id = auth.uid());

drop policy if exists "admin_select_all" on public.custom_plan_requests;
create policy "admin_select_all" on public.custom_plan_requests
  for select using (public.is_admin());

drop policy if exists "own_insert_request" on public.custom_plan_requests;
create policy "own_insert_request" on public.custom_plan_requests
  for insert with check (
    user_id = auth.uid()
    and offer_source = 'user_request'
    and status = 'pending'
    and admin_price is null
    and provider is null
    and provider_subscription_id is null
  );

revoke update, delete on public.custom_plan_requests from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. A "custom" plan row so an activated custom subscription is a completely
--    normal Pro-equivalent plan as far as useSubscription() / FeatureGate /
--    limit enforcement are concerned. The actual negotiated price a user
--    pays lives on their own custom_plan_requests row, never here (this row
--    is shared across every custom-plan customer).
-- ---------------------------------------------------------------------------
insert into public.subscription_plans (name, slug, description, price_monthly, price_yearly, sort_order, is_active, features, limits)
select
  'Custom', 'custom', 'A negotiated plan tailored to one customer''s needs.',
  0, 0, 2, false, -- is_active = false: never shown on the public Pricing page
  pro.features, pro.limits
from public.subscription_plans pro
where pro.slug = 'pro'
  and not exists (select 1 from public.subscription_plans where slug = 'custom');

-- ---------------------------------------------------------------------------
-- 4. User-facing: request a quote is a direct insert (RLS-enforced, see
--    above) — no RPC needed. Decline / Accept are RPCs because they must be
--    re-validated server-side (status, ownership, expiry) before anything
--    is allowed to happen.
-- ---------------------------------------------------------------------------
create or replace function public.decline_custom_plan_offer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from public.custom_plan_requests
    where id = p_id and user_id = auth.uid()
    for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_status <> 'offered' then raise exception 'This offer can no longer be declined'; end if;

  update public.custom_plan_requests
    set status = 'declined', updated_at = now()
    where id = p_id;
end;
$$;

-- Flips to payment_pending only. The actual Razorpay order/subscription is
-- created by the create-custom-plan-checkout Edge Function AFTER this
-- succeeds, reading admin_price fresh from this same row — the frontend
-- never passes a price anywhere in this sequence.
create or replace function public.accept_custom_plan_offer(p_id uuid)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  select * into v_req from public.custom_plan_requests
    where id = p_id and user_id = auth.uid()
    for update;
  if not found then raise exception 'Offer not found'; end if;

  if v_req.valid_until is not null and v_req.valid_until < now() and v_req.status = 'offered' then
    update public.custom_plan_requests set status = 'expired', updated_at = now() where id = p_id;
    raise exception 'This offer has expired';
  end if;
  if v_req.status <> 'offered' then
    raise exception 'This offer is no longer available';
  end if;

  update public.custom_plan_requests
    set status = 'payment_pending', updated_at = now()
    where id = p_id
    returning * into v_req;
  return v_req;
end;
$$;

grant execute on function public.decline_custom_plan_offer(uuid) to authenticated;
grant execute on function public.accept_custom_plan_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin: respond to a request, reject it, create a direct offer, edit an
--    offered price (same path serves WhatsApp-negotiated re-pricing for
--    EITHER offer_source), cancel, and list/inspect.
-- ---------------------------------------------------------------------------
create or replace function public.admin_respond_custom_plan_request(
  p_id uuid, p_admin_price numeric, p_billing_cycle text, p_admin_message text default null,
  p_valid_until timestamptz default null, p_reason text default null
)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.custom_plan_requests;
  v_action text;
begin
  perform public.require_admin();
  if p_admin_price is null or p_admin_price <= 0 then raise exception 'Price must be greater than zero'; end if;
  if p_billing_cycle not in ('monthly', 'yearly') then raise exception 'Invalid billing cycle'; end if;

  select * into v_req from public.custom_plan_requests where id = p_id and offer_source = 'user_request' for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status not in ('pending', 'reviewing') then raise exception 'This request has already been responded to'; end if;

  update public.custom_plan_requests set
    admin_price = p_admin_price, billing_cycle = p_billing_cycle, admin_message = p_admin_message,
    valid_until = p_valid_until, status = 'offered', handled_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_req;

  v_action := case when v_req.requested_price is not null and v_req.requested_price = p_admin_price
                    then 'CUSTOM_PLAN_PRICE_ACCEPTED' else 'CUSTOM_PLAN_COUNTER_OFFER_SENT' end;
  perform public._log_admin_action(v_action, v_req.user_id, 'custom_plan_requests', v_req.id,
    jsonb_build_object('requested_price', v_req.requested_price, 'admin_price', p_admin_price, 'reason', p_reason));

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (v_req.user_id, 'CUSTOM_PLAN_OFFER_READY', 'Your custom plan offer is ready',
          format('%s/%s', p_admin_price, p_billing_cycle), 'success', v_req.id);

  return v_req;
end;
$$;

create or replace function public.admin_reject_custom_plan_request(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  perform public.require_admin();
  select * into v_req from public.custom_plan_requests where id = p_id and offer_source = 'user_request' for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status not in ('pending', 'reviewing') then raise exception 'This request has already been handled'; end if;

  update public.custom_plan_requests
    set status = 'rejected', handled_by = auth.uid(), updated_at = now()
    where id = p_id;

  perform public._log_admin_action('CUSTOM_PLAN_REQUEST_REJECTED', v_req.user_id, 'custom_plan_requests', p_id,
    jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_create_custom_offer(
  p_user uuid, p_price numeric, p_billing_cycle text, p_description text,
  p_admin_message text default null, p_valid_until timestamptz default null
)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  perform public.require_admin();
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'Customer not found'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Price must be greater than zero'; end if;
  if p_billing_cycle not in ('monthly', 'yearly') then raise exception 'Invalid billing cycle'; end if;
  if p_description is null or length(trim(p_description)) = 0 then raise exception 'Description is required'; end if;

  insert into public.custom_plan_requests (
    user_id, offer_source, requested_price, billing_cycle, description, admin_price, admin_message,
    status, valid_until, created_by, handled_by
  ) values (
    p_user, 'admin_direct', null, p_billing_cycle, p_description, p_price, p_admin_message,
    'offered', p_valid_until, auth.uid(), auth.uid()
  ) returning * into v_req;

  perform public._log_admin_action('CUSTOM_PLAN_DIRECT_OFFER_CREATED', p_user, 'custom_plan_requests', v_req.id,
    jsonb_build_object('admin_price', p_price, 'billing_cycle', p_billing_cycle));

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (p_user, 'CUSTOM_PLAN_DIRECT_OFFER_CREATED', 'MoneyFlow has a special offer for you',
          format('%s/%s', p_price, p_billing_cycle), 'success', v_req.id);

  return v_req;
end;
$$;

create or replace function public.admin_update_custom_offer(
  p_id uuid, p_admin_price numeric, p_admin_message text default null,
  p_valid_until timestamptz default null, p_reason text default null
)
returns public.custom_plan_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.custom_plan_requests;
  v_old numeric;
  v_action text;
begin
  perform public.require_admin();
  if p_admin_price is null or p_admin_price <= 0 then raise exception 'Price must be greater than zero'; end if;

  select * into v_req from public.custom_plan_requests where id = p_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_req.status <> 'offered' then raise exception 'Only an offered, unpaid offer can be edited'; end if;

  v_old := v_req.admin_price;
  update public.custom_plan_requests set
    admin_price = p_admin_price, admin_message = coalesce(p_admin_message, admin_message),
    valid_until = p_valid_until, handled_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_req;

  v_action := case when v_req.offer_source = 'admin_direct'
                    then 'CUSTOM_PLAN_DIRECT_OFFER_UPDATED' else 'CUSTOM_PLAN_OFFER_PRICE_UPDATED' end;
  perform public._log_admin_action(v_action, v_req.user_id, 'custom_plan_requests', v_req.id,
    jsonb_build_object('old_price', v_old, 'new_price', p_admin_price, 'reason', p_reason));

  insert into public.alerts (user_id, type, title, body, severity, related_id)
  values (v_req.user_id, 'CUSTOM_PLAN_OFFER_READY', 'Your custom plan offer has been updated',
          format('%s/%s', p_admin_price, v_req.billing_cycle), 'info', v_req.id);

  return v_req;
end;
$$;

create or replace function public.admin_cancel_custom_offer(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.custom_plan_requests;
begin
  perform public.require_admin();
  select * into v_req from public.custom_plan_requests where id = p_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_req.status not in ('pending', 'reviewing', 'offered', 'payment_pending') then
    raise exception 'This offer can no longer be cancelled';
  end if;

  update public.custom_plan_requests
    set status = 'cancelled', handled_by = auth.uid(), updated_at = now()
    where id = p_id;

  perform public._log_admin_action('CUSTOM_PLAN_DIRECT_OFFER_CANCELLED', v_req.user_id, 'custom_plan_requests', p_id,
    jsonb_build_object('reason', p_reason));
end;
$$;

grant execute on function public.admin_respond_custom_plan_request(uuid, numeric, text, text, timestamptz, text) to authenticated;
grant execute on function public.admin_reject_custom_plan_request(uuid, text) to authenticated;
grant execute on function public.admin_create_custom_offer(uuid, numeric, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_update_custom_offer(uuid, numeric, text, timestamptz, text) to authenticated;
grant execute on function public.admin_cancel_custom_offer(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Admin list/detail (same LEFT JOIN + ::text email-cast lessons as the
--    rest of the admin system).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_custom_plan_requests(
  p_source text default null,
  p_status text default null,
  p_search text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid, user_id uuid, email text, full_name text, offer_source text,
  requested_price numeric, admin_price numeric, billing_cycle text, status text,
  description text, valid_until timestamptz, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select c.id, c.user_id, u.email::text, p.full_name, c.offer_source,
           c.requested_price, c.admin_price, c.billing_cycle, c.status,
           c.description, c.valid_until, c.created_at,
           count(*) over ()::bigint
    from public.custom_plan_requests c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    where (p_source is null or p_source = '' or c.offer_source = p_source)
      and (p_status is null or p_status = '' or c.status = p_status)
      and (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%')
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_get_custom_plan_request(p_id uuid)
returns table (
  id uuid, user_id uuid, email text, full_name text, offer_source text,
  requested_price numeric, admin_price numeric, billing_cycle text, description text,
  additional_requirements text, admin_message text, status text, valid_until timestamptz,
  provider text, provider_subscription_id text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select c.id, c.user_id, u.email::text, p.full_name, c.offer_source,
           c.requested_price, c.admin_price, c.billing_cycle, c.description,
           c.additional_requirements, c.admin_message, c.status, c.valid_until,
           c.provider, c.provider_subscription_id, c.created_at, c.updated_at
    from public.custom_plan_requests c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    where c.id = p_id;
end;
$$;

grant execute on function public.admin_list_custom_plan_requests(text, text, text, int, int) to authenticated;
grant execute on function public.admin_get_custom_plan_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Realtime — so the offer card / admin list update live without a manual
--    refresh (mirrors user_subscriptions from 023).
-- ---------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.custom_plan_requests;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
