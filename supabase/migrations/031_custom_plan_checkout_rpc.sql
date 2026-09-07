-- 031_custom_plan_checkout_rpc.sql
-- =========================================================================
-- create-custom-plan-checkout still used the Secret-key admin client to (a)
-- read the custom_plan_requests row and (b) cache the Razorpay subscription
-- id onto it. (a) is unnecessary — own_select already lets the owner read
-- their own row (see 027_custom_plan_requests.sql) — and (b) requires
-- elevated privilege since UPDATE is revoked from authenticated/anon. Same
-- underlying issue as 030: this project's Secret key was found NOT to carry
-- real elevated table privileges via supabase-js/PostgREST, so (b) moves
-- into a SECURITY DEFINER RPC instead, exactly like apply_subscription_
-- webhook_event.
-- =========================================================================

create or replace function public.set_custom_plan_provider_subscription(
  p_id uuid,
  p_provider text,
  p_provider_subscription_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.custom_plan_requests
    set provider = p_provider,
        provider_subscription_id = p_provider_subscription_id,
        updated_at = now()
    where id = p_id and user_id = auth.uid();
end;
$$;

grant execute on function public.set_custom_plan_provider_subscription(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
