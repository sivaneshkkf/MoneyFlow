import { useEffect } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subMonths } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const RECORD_SELECT = '*, account:accounts(id,name)'

export function useLendingSummary() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['lending', 'summary', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_lending_summary')
      if (error) throw error
      const r = data?.[0] ?? {}
      return {
        totalLent: Number(r.total_lent ?? 0),
        outstanding: Number(r.outstanding ?? 0),
        received: Number(r.received ?? 0),
        interestEarned: Number(r.interest_earned ?? 0),
        overdue: Number(r.overdue ?? 0),
        borrowerCount: Number(r.borrower_count ?? 0),
        recoveryPct: Number(r.total_lent) > 0 ? (Number(r.received) / Number(r.total_lent)) * 100 : 0,
      }
    },
  })
}

// Self-heals stored overdue/next-due for scheduled loans as dates roll forward
// (there is no cron). Throttled + mounted once via useRefreshLendingStatus() —
// NEVER call from a queryFn: the RPC writes lending_records, which Realtime fans
// out into query invalidation, which would loop.
let lastScheduleRefresh = 0

export function useRefreshLendingStatus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  useEffect(() => {
    if (!user?.id) return
    if (Date.now() - lastScheduleRefresh < 120_000) return
    lastScheduleRefresh = Date.now()
    supabase
      .rpc('refresh_lending_schedule_status')
      .then(({ error }) => {
        if (!error) {
          qc.invalidateQueries({ queryKey: ['lending'] })
          qc.invalidateQueries({ queryKey: ['dashboard'] })
        }
      })
      .catch(() => {})
  }, [user?.id, qc])
}

export function useLendingRecords(filters = {}) {
  const { user } = useAuth()
  const { status, search = '', minAmount, maxAmount, from, to } = filters
  return useQuery({
    queryKey: ['lending', 'records', { ...filters, user: user?.id }],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      let q = supabase.from('lending_records').select(RECORD_SELECT).order('lending_date', { ascending: false })
      if (status) q = q.eq('status', status)
      if (search.trim()) q = q.ilike('borrower_name', `%${search.trim()}%`)
      if (minAmount) q = q.gte('principal_amount', minAmount)
      if (maxAmount) q = q.lte('principal_amount', maxAmount)
      if (from) q = q.gte('lending_date', from)
      if (to) q = q.lte('lending_date', to)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map(decorate)
    },
  })
}

export function useLendingRecord(id) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['lending', 'record', id, user?.id],
    enabled: Boolean(user?.id && id),
    queryFn: async () => {
      const [rec, reps, insts] = await Promise.all([
        supabase.from('lending_records').select(RECORD_SELECT).eq('id', id).single(),
        supabase
          .from('lending_repayments')
          .select('*, account:accounts(name), payment_method:payment_methods(name)')
          .eq('lending_record_id', id)
          .order('payment_date', { ascending: false }),
        supabase
          .from('lending_installments')
          .select('*')
          .eq('lending_record_id', id)
          .order('installment_number', { ascending: true }),
      ])
      if (rec.error) throw rec.error
      if (reps.error) throw reps.error
      if (insts.error) throw insts.error
      return { ...decorate(rec.data), repayments: reps.data ?? [], installments: insts.data ?? [] }
    },
  })
}

export function useRepaymentAllocations(repaymentIds = []) {
  const { user } = useAuth()
  const ids = [...repaymentIds].sort()
  return useQuery({
    queryKey: ['lending', 'allocations', ids, user?.id],
    enabled: Boolean(user?.id && ids.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lending_repayment_allocations')
        .select('*, installment:lending_installments(installment_number, due_date)')
        .in('repayment_id', ids)
      if (error) throw error
      const byRepayment = {}
      for (const a of data ?? []) (byRepayment[a.repayment_id] ??= []).push(a)
      return byRepayment
    },
  })
}

export function useBorrowers() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['lending', 'borrowers', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lending_records')
        .select(
          'borrower_name, phone, principal_amount, principal_received, interest_received, outstanding_principal, outstanding_interest, due_date, next_due_date, overdue_amount, schedule_generated, status',
        )
      if (error) throw error
      const map = new Map()
      for (const r of data ?? []) {
        const key = r.borrower_name
        const b = map.get(key) || {
          borrower_name: key,
          phone: r.phone,
          totalLent: 0,
          totalReceived: 0,
          outstanding: 0,
          overdueAmount: 0,
          nextDue: null,
          overdue: false,
          count: 0,
        }
        b.count += 1
        b.totalLent += Number(r.principal_amount)
        b.totalReceived += Number(r.principal_received) + Number(r.interest_received)
        b.outstanding += Number(r.outstanding_principal) + Number(r.outstanding_interest)
        b.overdueAmount += Number(r.overdue_amount ?? 0)
        if (r.phone && !b.phone) b.phone = r.phone
        if (Number(r.overdue_amount ?? 0) > 0.005) b.overdue = true
        const rem = Number(r.outstanding_principal) + Number(r.outstanding_interest)
        const nd = r.schedule_generated ? r.next_due_date : r.due_date
        if (rem > 0 && nd && (!b.nextDue || nd < b.nextDue)) b.nextDue = nd
        map.set(key, b)
      }
      return [...map.values()].sort((a, b) => b.outstanding - a.outstanding)
    },
  })
}

export function useLendingTrend(months = 6) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['lending', 'trend', months, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const from = format(subMonths(new Date(), months - 1), 'yyyy-MM-01')
      const [lent, repaid] = await Promise.all([
        supabase.from('lending_records').select('principal_amount, lending_date').gte('lending_date', from),
        supabase.from('lending_repayments').select('amount, payment_date').gte('payment_date', from),
      ])
      if (lent.error) throw lent.error
      if (repaid.error) throw repaid.error
      const bucket = {}
      for (let i = months - 1; i >= 0; i--) {
        const k = format(subMonths(new Date(), i), 'yyyy-MM')
        bucket[k] = { month: format(subMonths(new Date(), i), 'MMM'), lent: 0, recovered: 0 }
      }
      for (const r of lent.data ?? []) {
        const k = r.lending_date.slice(0, 7)
        if (bucket[k]) bucket[k].lent += Number(r.principal_amount)
      }
      for (const r of repaid.data ?? []) {
        const k = r.payment_date.slice(0, 7)
        if (bucket[k]) bucket[k].recovered += Number(r.amount)
      }
      return Object.values(bucket)
    },
  })
}

// Server query is keyed only on the date range. Borrower search is applied
// client-side (see LendingReceivedPage) so typing never triggers a refetch.
export function useReceivedRepayments({ from, to } = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['lending', 'received', { from: from ?? null, to: to ?? null, user: user?.id }],
    enabled: Boolean(user?.id),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from('lending_repayments')
        .select('*, account:accounts(name), payment_method:payment_methods(name), record:lending_records(borrower_name)')
        .order('payment_date', { ascending: false })
      if (from) q = q.gte('payment_date', from)
      if (to) q = q.lte('payment_date', to)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}

export function summariseRepayments(rows = []) {
  return rows.reduce(
    (acc, r) => ({
      principal: acc.principal + Number(r.principal_amount),
      interest: acc.interest + Number(r.interest_amount),
      total: acc.total + Number(r.amount),
    }),
    { principal: 0, interest: 0, total: 0 },
  )
}

function decorate(r) {
  if (!r) return r
  const outstanding = Number(r.outstanding_principal) + Number(r.outstanding_interest)
  const overdueAmount = Number(r.overdue_amount ?? 0)
  // Schedule-aware: overdue days measured from the next unpaid due date, not the
  // loan's final due date. Falls back to the single due date for one-time loans.
  const overdueFrom = r.schedule_generated ? r.next_due_date : r.due_date
  let daysOverdue = 0
  if (overdueFrom && overdueAmount > 0.005) {
    daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(overdueFrom).getTime()) / 86400000))
  }
  return {
    ...r,
    outstanding,
    overdueAmount,
    overdueCount: Number(r.overdue_installments ?? (overdueAmount > 0 ? 1 : 0)),
    nextDueDate: r.schedule_generated ? r.next_due_date : outstanding > 0.005 ? r.due_date : null,
    nextDueAmount: Number(r.next_due_amount ?? 0) || (outstanding > 0.005 ? outstanding : 0),
    daysOverdue,
  }
}

export function useLendingMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lending'] })
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    // repayments create/remove interest-income transactions
    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['analytics'] })
  }

  const create = useMutation({
    mutationFn: async (values) => {
      const { data, error } = await supabase
        .from('lending_records')
        .insert({ ...values, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, ...values }) => {
      const { data, error } = await supabase
        .from('lending_records')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    // Atomic RPC: reverses every repayment's account cash + its lending_interest
    // transaction, lets trg_lending_cash_out refund the principal, then deletes
    // the record (FK cascades handle repayments / installments / allocations).
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('delete_lending_record', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const recordRepayment = useMutation({
    mutationFn: async ({
      recordId,
      amount,
      principal,
      interest,
      date,
      accountId,
      paymentMethodId,
      notes,
      clientToken,
    }) => {
      const { data, error } = await supabase.rpc('record_lending_repayment', {
        p_lending_record_id: recordId,
        p_amount: amount,
        p_principal: principal,
        p_interest: interest,
        p_payment_date: date,
        p_account_id: accountId || null,
        p_payment_method_id: paymentMethodId || null,
        p_notes: notes || null,
        p_attachment_url: null,
        p_client_token: clientToken ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const deleteRepayment = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('delete_lending_repayment', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const generateSchedule = useMutation({
    mutationFn: async ({ recordId, frequency, firstDueDate, count, interestTotal = 0 }) => {
      const { data, error } = await supabase.rpc('generate_lending_schedule', {
        p_record: recordId,
        p_frequency: frequency,
        p_first_due_date: firstDueDate,
        p_count: count,
        p_interest_total: interestTotal,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const updateInstallmentDueDate = useMutation({
    mutationFn: async ({ installmentId, dueDate }) => {
      const { error } = await supabase.rpc('update_installment_due_date', {
        p_installment: installmentId,
        p_due_date: dueDate,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { create, update, remove, recordRepayment, deleteRepayment, generateSchedule, updateInstallmentDueDate }
}
