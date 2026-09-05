import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const KEY = ['bills']

const RECURRING_SELECT =
  '*, category:categories(id,name,color,icon,type), account:accounts(id,name), payment_method:payment_methods(id,name), liability:liabilities(*)'

// ---------------------------------------------------------------------------
// Opportunistic processor: there is a daily pg_cron job, but this keeps things
// fresh the moment the user opens the app (throttled, mirrors the lending one).
// NEVER call from a queryFn.
// ---------------------------------------------------------------------------
let lastProcess = 0
export function useProcessRecurring() {
  const { user } = useAuth()
  const qc = useQueryClient()
  useEffect(() => {
    if (!user?.id) return
    if (Date.now() - lastProcess < 120_000) return
    lastProcess = Date.now()
    supabase
      .rpc('process_my_recurring')
      .then(({ error }) => {
        if (!error) {
          qc.invalidateQueries({ queryKey: KEY })
          qc.invalidateQueries({ queryKey: ['dashboard'] })
          qc.invalidateQueries({ queryKey: ['alerts'] })
        }
      })
      .catch(() => {})
  }, [user?.id, qc])
}

export function useBillsSummary() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...KEY, 'summary', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_bills_summary')
      if (error) throw error
      const r = data?.[0] ?? {}
      return {
        upcoming: Number(r.upcoming_amount ?? 0),
        dueThisMonth: Number(r.due_this_month_amount ?? 0),
        overdue: Number(r.overdue_amount ?? 0),
        activeCount: Number(r.active_count ?? 0),
        overdueCount: Number(r.overdue_count ?? 0),
      }
    },
  })
}

/** All recurring definitions + their open (unpaid) occurrences, merged. */
export function useRecurringPayments() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...KEY, 'list', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)

      const [defs, occ, paid] = await Promise.all([
        supabase.from('recurring_transactions').select(RECURRING_SELECT).order('created_at', { ascending: false }),
        supabase
          .from('recurring_payment_occurrences')
          .select('*')
          .in('status', ['upcoming', 'due', 'overdue'])
          .order('due_date', { ascending: true }),
        // paid occurrences whose payment lands in the current calendar month
        supabase
          .from('recurring_payment_occurrences')
          .select('*')
          .eq('status', 'paid')
          .gte('paid_at', monthStart)
          .lt('paid_at', monthEnd)
          .order('paid_at', { ascending: false }),
      ])
      if (defs.error) throw defs.error
      if (occ.error) throw occ.error
      if (paid.error) throw paid.error

      const openByDef = new Map()
      for (const o of occ.data ?? []) {
        if (!openByDef.has(o.recurring_transaction_id)) openByDef.set(o.recurring_transaction_id, [])
        openByDef.get(o.recurring_transaction_id).push(o)
      }
      const paidByDef = new Map()
      for (const o of paid.data ?? []) {
        if (!paidByDef.has(o.recurring_transaction_id)) paidByDef.set(o.recurring_transaction_id, [])
        paidByDef.get(o.recurring_transaction_id).push(o)
      }

      return (defs.data ?? []).map((d) => {
        const open = openByDef.get(d.id) ?? []
        const next = open[0] ?? null
        return {
          ...d,
          displayName: d.name || d.description || 'Recurring payment',
          openOccurrences: open,
          paidThisMonth: paidByDef.get(d.id) ?? [],
          nextOccurrence: next,
          overdueCount: open.filter((o) => o.status === 'overdue').length,
        }
      })
    },
  })
}

/** Flat list of upcoming/overdue occurrences (dashboard widget + page section). */
export function useUpcomingBills(limit = 40) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...KEY, 'upcoming', limit, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_payment_occurrences')
        .select(
          'id, due_date, scheduled_amount, principal_amount, interest_amount, status, installment_number, recurring:recurring_transactions(id,name,kind,category:categories(name,color,icon))',
        )
        .in('status', ['upcoming', 'due', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map((o) => ({
        ...o,
        name: o.recurring?.name ?? 'Payment',
        kind: o.recurring?.kind ?? 'recurring',
        recurringId: o.recurring?.id,
      }))
    },
  })
}

export function useRecurringPayment(id) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...KEY, 'detail', id, user?.id],
    enabled: Boolean(user?.id && id),
    queryFn: async () => {
      const [def, occ] = await Promise.all([
        supabase.from('recurring_transactions').select(RECURRING_SELECT).eq('id', id).single(),
        supabase
          .from('recurring_payment_occurrences')
          .select('*, transaction:transactions(id,amount,transaction_date,description)')
          .eq('recurring_transaction_id', id)
          .order('due_date', { ascending: true }),
      ])
      if (def.error) throw def.error
      if (occ.error) throw occ.error
      return {
        ...def.data,
        displayName: def.data.name || def.data.description || 'Recurring payment',
        occurrences: occ.data ?? [],
      }
    },
  })
}

export function useBillMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['analytics'] })
    qc.invalidateQueries({ queryKey: ['alerts'] })
  }

  const generate = async (recurringId) => {
    await supabase.rpc('generate_recurring_occurrences', { p_recurring: recurringId, p_horizon: null })
  }

  const create = useMutation({
    mutationFn: async (input) => {
      const { emi, ...values } = input
      let liabilityId = null
      if (values.kind === 'emi' && emi) {
        const { data: lia, error: le } = await supabase
          .from('liabilities')
          .insert({
            user_id: user.id,
            name: values.name,
            lender_name: emi.lender_name || null,
            original_principal: emi.original_principal,
            outstanding_principal: emi.original_principal,
            interest_rate: emi.interest_rate || 0,
            installments_total: emi.installments_total || 0,
            emi_amount: values.amount,
            start_date: values.start_date,
            account_id: values.account_id || null,
          })
          .select()
          .single()
        if (le) throw le
        liabilityId = lia.id
      }
      const { data, error } = await supabase
        .from('recurring_transactions')
        .insert({
          ...values,
          user_id: user.id,
          type: 'expense',
          liability_id: liabilityId,
          next_run_date: values.start_date,
          is_active: true,
          status: 'active',
        })
        .select()
        .single()
      if (error) throw error
      await generate(data.id)
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, emi, ...values }) => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      if (emi && data.liability_id) {
        await supabase
          .from('liabilities')
          .update({
            name: values.name,
            lender_name: emi.lender_name || null,
            interest_rate: emi.interest_rate || 0,
            emi_amount: values.amount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.liability_id)
      }
      await generate(id)
      return data
    },
    onSuccess: invalidate,
  })

  const setStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase
        .from('recurring_transactions')
        .update({ status, is_active: status === 'active', updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      if (status === 'active') await generate(id)
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async ({ id, hard = false }) => {
      const { error } = await supabase.rpc('delete_recurring_payment', { p_recurring: id, p_hard: hard })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const skip = useMutation({
    mutationFn: async (occurrenceId) => {
      const { error } = await supabase.rpc('skip_recurring_occurrence', { p_occurrence: occurrenceId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const recordPayment = useMutation({
    mutationFn: async ({ occurrenceId, amount, date, accountId, categoryId, paymentMethodId, notes, clientToken }) => {
      const { data, error } = await supabase.rpc('record_bill_payment', {
        p_occurrence: occurrenceId,
        p_amount: amount,
        p_date: date,
        p_account_id: accountId || null,
        p_category_id: categoryId || null,
        p_payment_method_id: paymentMethodId || null,
        p_notes: notes || null,
        p_client_token: clientToken ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const recordEmiPayment = useMutation({
    mutationFn: async ({
      occurrenceId, amount, principal, interest, date, accountId, categoryId, paymentMethodId, notes, clientToken,
    }) => {
      const { data, error } = await supabase.rpc('record_liability_payment', {
        p_occurrence: occurrenceId,
        p_amount: amount,
        p_principal: principal,
        p_interest: interest,
        p_date: date,
        p_account_id: accountId || null,
        p_category_id: categoryId || null,
        p_payment_method_id: paymentMethodId || null,
        p_notes: notes || null,
        p_client_token: clientToken ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  return { create, update, setStatus, remove, skip, recordPayment, recordEmiPayment }
}
