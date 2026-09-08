-- 039: manual "Add next payment" for an ongoing (no End Date) bill /
--      subscription / recurring payment.
--
-- Context: end_date was never being auto-set anywhere -- BillForm.jsx already
-- sends `end_date: v.end_date || null`, and generate_recurring_occurrences()
-- never touches end_date at all. What actually limits how far occurrences
-- get generated is the ROLLING HORIZON: generate_recurring_occurrences()
-- only ever materialises occurrences up to `current_date + 95 days` by
-- default (called opportunistically on load + daily via pg_cron), so a
-- monthly bill's due dates only ever appear ~3 months ahead at a time, and a
-- YEARLY bill's next occurrence can go unlisted for the better part of a
-- year until it finally falls inside that 95-day window. That's correct,
-- intentional behaviour (it's what keeps this from ever generating decades
-- of future rows for an indefinite recurring item) -- but it does mean a
-- user may reasonably want to pull the next occurrence in early, especially
-- for longer frequencies.
--
-- generate_next_recurring_occurrence() adds exactly one more occurrence
-- beyond whatever currently exists, reusing the exact same
-- recurring_first_due()/recurring_step() helpers generate_recurring_
-- occurrences() itself uses for the rolling-horizon (non-EMI) path, and the
-- same ON CONFLICT (recurring_transaction_id, due_date) DO NOTHING
-- idempotency key -- calling it twice in a row is a safe no-op the second
-- time. Not applicable to EMI (its full installment schedule is already
-- generated upfront by generate_recurring_occurrences(), there is no single
-- "next" to add) or a one_time payment (it only ever has the one occurrence
-- by design) -- both raise a clear, user-facing error instead of doing
-- something confusing.
create or replace function public.generate_next_recurring_occurrence(p_recurring uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recurring_transactions;
  last_due date;
  step interval;
  due date;
  existing public.recurring_payment_occurrences;
  inserted public.recurring_payment_occurrences;
begin
  select * into r from public.recurring_transactions
    where id = p_recurring and user_id = auth.uid();
  if not found then
    raise exception 'Recurring payment not found';
  end if;
  if r.status <> 'active' then
    raise exception 'This payment is paused or ended -- resume it first to add another payment.';
  end if;
  if r.kind = 'emi' then
    raise exception 'An EMI''s full installment schedule is already generated -- there is no single next payment to add.';
  end if;
  if r.frequency = 'one_time' then
    raise exception 'This is a one-time payment, so there is no next occurrence to add.';
  end if;

  step := public.recurring_step(r.frequency);
  if step is null then
    raise exception 'Unsupported schedule frequency: %', r.frequency;
  end if;

  select max(due_date) into last_due from public.recurring_payment_occurrences
    where recurring_transaction_id = p_recurring;

  if last_due is null then
    due := public.recurring_first_due(coalesce(r.start_date, current_date), r.frequency, r.due_day, r.due_weekday, r.due_month);
  else
    due := (last_due + step)::date;
  end if;

  if r.end_date is not null and due > r.end_date then
    raise exception 'This payment''s schedule already ends on % -- there is nothing further to add.', to_char(r.end_date, 'DD Mon YYYY');
  end if;

  -- Idempotent: the rolling horizon (opportunistic refresh / daily cron)
  -- may have already generated this exact occurrence between page loads --
  -- report it instead of erroring.
  select * into existing from public.recurring_payment_occurrences
    where recurring_transaction_id = p_recurring and due_date = due;
  if found then
    return jsonb_build_object('created', false, 'due_date', due, 'occurrence_id', existing.id);
  end if;

  insert into public.recurring_payment_occurrences (
    recurring_transaction_id, user_id, due_date, scheduled_amount
  ) values (p_recurring, auth.uid(), due, r.amount)
  on conflict (recurring_transaction_id, due_date) do nothing
  returning * into inserted;

  if inserted.id is null then
    -- Lost a race with a concurrent generator call -- same idempotent report.
    select * into existing from public.recurring_payment_occurrences
      where recurring_transaction_id = p_recurring and due_date = due;
    return jsonb_build_object('created', false, 'due_date', due, 'occurrence_id', existing.id);
  end if;

  update public.recurring_transactions
    set next_run_date = coalesce((
          select min(due_date) from public.recurring_payment_occurrences
          where recurring_transaction_id = p_recurring and status in ('upcoming','due','overdue')
        ), next_run_date),
        updated_at = now()
    where id = p_recurring;

  return jsonb_build_object('created', true, 'due_date', due, 'occurrence_id', inserted.id);
end;
$$;

grant execute on function public.generate_next_recurring_occurrence(uuid) to authenticated;
