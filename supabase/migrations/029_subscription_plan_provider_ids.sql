-- 029_subscription_plan_provider_ids.sql
-- =========================================================================
-- Caches the Razorpay Plan object id created for each (plan, billing_cycle)
-- pair, so create-razorpay-subscription only creates a Razorpay Plan once
-- per pair (first checkout attempt) and re-uses it on every later checkout,
-- instead of creating a throwaway Plan on every single subscribe click.
--
-- Only ever written by the create-razorpay-subscription Edge Function via
-- the service-role key — subscription_plans already revokes insert/update/
-- delete from authenticated/anon (see 021), so no policy change is needed.
-- =========================================================================

alter table public.subscription_plans
  add column if not exists provider_plan_id_monthly text,
  add column if not exists provider_plan_id_yearly text;

notify pgrst, 'reload schema';
