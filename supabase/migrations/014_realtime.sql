-- 014_realtime.sql
-- Expose a small set of user-owned tables to Supabase Realtime.
-- RLS still applies to the stream, so users only receive their own row changes.
do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lending_records;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lending_repayments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.alerts;
exception when duplicate_object then null;
end $$;
