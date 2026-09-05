-- 028_contact_messages.sql
-- =========================================================================
-- Public Contact Us form submissions.
--
-- This is a write-only mailbox from the client's point of view: anyone
-- (including a logged-out visitor — the Contact page is public) may INSERT
-- a message, but only admins may ever read them. No email is invented or
-- assumed here — this only stores what the visitor typed.
-- =========================================================================

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  subject text not null check (char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 1 and 5000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_messages_created on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

-- Anyone may submit (logged-out visitors included) — no ownership check on
-- insert since there may be no authenticated user at all.
drop policy if exists "public_insert" on public.contact_messages;
create policy "public_insert" on public.contact_messages for insert with check (true);

-- Only admins may ever read a submission.
drop policy if exists "admin_select" on public.contact_messages;
create policy "admin_select" on public.contact_messages for select using (public.is_admin());

-- Table-level grants: anon must be able to INSERT (default privileges from
-- 015 only gave anon SELECT); nobody but an admin RPC/dashboard may read,
-- and nobody may edit or delete a submission from the client.
grant insert on public.contact_messages to anon, authenticated;
revoke select, update, delete on public.contact_messages from authenticated;
revoke update, delete on public.contact_messages from anon;

notify pgrst, 'reload schema';
