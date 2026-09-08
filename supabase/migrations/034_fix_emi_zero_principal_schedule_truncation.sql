-- 034: an EMI created with no "Original principal" filled in (saved as 0)
--      only ever got ONE installment row generated, no matter what
--      "Number of installments" was set to.
--
-- Root cause: the amortisation loop's early-exit --
--   exit when bal <= 0.005;
-- -- is meant to stop scheduling once the loan is actually paid off before
-- reaching installments_total (e.g. rounding clears the balance a bit
-- early). But `bal` starts at lia.original_principal, so when that's 0 the
-- condition is already true after the very first iteration (n = 1) even
-- though nothing was ever "paid off" -- there was simply nothing to begin
-- with. The remaining installments (#2, #3, ...) never got created.
--
-- Fix: only treat reaching a zero balance as "paid off early" when there
-- was a real principal to pay off in the first place. An EMI with a genuine
-- principal keeps the old early-stop behaviour unchanged; one with no
-- principal filled in now generates its full installment count.
create or replace function public.generate_recurring_occurrences(
  p_recurring uuid,
  p_horizon date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recurring_transactions;
  lia public.liabilities;
  horizon date := coalesce(p_horizon, current_date + interval '95 days');
  step interval;
  due date;
  last_due date;
  n int;
  bal numeric(14,2);
  mrate numeric(20,10);
  i_amt numeric(14,2);
  p_amt numeric(14,2);
  v_dates date[] := '{}';
begin
  select * into r from public.recurring_transactions where id = p_recurring;
  if not found or r.status <> 'active' then return; end if;
  -- Cross-user guard for direct authenticated callers; the system processor
  -- (auth.uid() is null under pg_cron) is allowed through.
  if auth.uid() is not null and r.user_id <> auth.uid() then return; end if;

  if r.kind = 'emi' and r.liability_id is not null then
    select * into lia from public.liabilities where id = r.liability_id;
    -- Build the full amortisation schedule once (bounded by installments_total).
    if lia.installments_total > 0 then
      bal := lia.original_principal;
      mrate := case when lia.interest_rate > 0 then lia.interest_rate / 1200.0 else 0 end;
      due := public.recurring_first_due(coalesce(r.start_date, lia.start_date), r.frequency,
                                        r.due_day, r.due_weekday, r.due_month);
      step := coalesce(public.recurring_step(r.frequency), interval '1 month');

      -- Precompute the due date this schedule assigns to every installment
      -- so we can drop any pending row that no longer belongs (stale from a
      -- prior edit) without disturbing rows whose date is still correct.
      for n in 1 .. lia.installments_total loop
        v_dates := array_append(v_dates, (due + step * (n - 1))::date);
      end loop;
      delete from public.recurring_payment_occurrences
        where recurring_transaction_id = r.id
          and status in ('upcoming','due','overdue')
          and not (due_date = any (v_dates));

      for n in 1 .. lia.installments_total loop
        if mrate > 0 then
          i_amt := round(bal * mrate, 2);
          p_amt := round(coalesce(nullif(lia.emi_amount,0), r.amount) - i_amt, 2);
        elsif coalesce(r.emi_principal,0) > 0 or coalesce(r.emi_interest,0) > 0 then
          p_amt := coalesce(r.emi_principal, 0);
          i_amt := coalesce(r.emi_interest, 0);
        else
          p_amt := round(lia.original_principal / lia.installments_total, 2);
          i_amt := 0;
        end if;
        if n = lia.installments_total then
          p_amt := greatest(0, bal);           -- last installment clears the balance
        end if;
        p_amt := least(p_amt, bal);
        insert into public.recurring_payment_occurrences (
          recurring_transaction_id, liability_id, user_id, installment_number,
          due_date, scheduled_amount, principal_amount, interest_amount
        ) values (
          r.id, r.liability_id, r.user_id, n,
          v_dates[n], p_amt + i_amt, p_amt, i_amt
        )
        on conflict (recurring_transaction_id, due_date) do update
          set installment_number = excluded.installment_number,
              scheduled_amount = excluded.scheduled_amount,
              principal_amount = excluded.principal_amount,
              interest_amount = excluded.interest_amount,
              updated_at = now()
          where public.recurring_payment_occurrences.status in ('upcoming','due','overdue');
        bal := round(bal - p_amt, 2);
        -- Only stop early for a genuine "paid off before the end" case --
        -- never when there was no principal to begin with (bal started at 0).
        exit when lia.original_principal > 0.005 and bal <= 0.005;
      end loop;
    end if;
    update public.recurring_transactions
      set last_processed_date = current_date,
          next_run_date = coalesce((
            select min(due_date) from public.recurring_payment_occurrences
            where recurring_transaction_id = r.id and status in ('upcoming','due','overdue')
          ), r.next_run_date)
      where id = r.id;
    return;
  end if;

  -- Bill / subscription / recurring: rolling horizon.
  select max(due_date) into last_due from public.recurring_payment_occurrences
    where recurring_transaction_id = r.id;

  if r.frequency = 'one_time' then
    if last_due is null then
      due := public.recurring_first_due(coalesce(r.start_date, current_date), 'one_time', r.due_day, r.due_weekday, r.due_month);
      insert into public.recurring_payment_occurrences (
        recurring_transaction_id, user_id, due_date, scheduled_amount
      ) values (r.id, r.user_id, due, r.amount)
      on conflict (recurring_transaction_id, due_date) do nothing;
    end if;
  else
    step := public.recurring_step(r.frequency);
    if step is null then return; end if;
    if last_due is null then
      due := public.recurring_first_due(coalesce(r.start_date, current_date), r.frequency, r.due_day, r.due_weekday, r.due_month);
    else
      due := (last_due + step)::date;
    end if;
    n := 0;
    while due <= horizon and n < 240 loop
      exit when r.end_date is not null and due > r.end_date;
      insert into public.recurring_payment_occurrences (
        recurring_transaction_id, user_id, due_date, scheduled_amount
      ) values (r.id, r.user_id, due, r.amount)
      on conflict (recurring_transaction_id, due_date) do nothing;
      due := (due + step)::date;
      n := n + 1;
    end loop;
  end if;

  update public.recurring_transactions
    set last_processed_date = current_date,
        next_run_date = coalesce((
          select min(due_date) from public.recurring_payment_occurrences
          where recurring_transaction_id = r.id and status in ('upcoming','due','overdue')
        ), r.next_run_date)
    where id = r.id;
end;
$$;
