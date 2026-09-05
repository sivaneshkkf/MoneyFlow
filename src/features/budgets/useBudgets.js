import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const d = (x) => format(x, 'yyyy-MM-dd')

export function budgetStatus(spent, amount) {
  const pct = amount > 0 ? (spent / amount) * 100 : 0
  if (pct > 100) return { key: 'exceeded', label: 'Exceeded', tone: 'danger', pct }
  if (pct >= 90) return { key: 'critical', label: 'Critical', tone: 'danger', pct }
  if (pct >= 70) return { key: 'warning', label: 'Near limit', tone: 'warning', pct }
  return { key: 'healthy', label: 'Under budget', tone: 'success', pct }
}

/** Budgets for a given month + matching actual spend per category. */
export function useBudgets(year, month) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['budgets', year, month, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const monthStart = new Date(year, month - 1, 1)
      const from = d(startOfMonth(monthStart))
      const to = d(endOfMonth(monthStart))

      const [budgetsRes, spendRes] = await Promise.all([
        supabase
          .from('budgets')
          .select('*, category:categories(id,name,color,icon)')
          .eq('year', year)
          .eq('month', month),
        supabase.rpc('get_category_expense_summary', { p_from: from, p_to: to }),
      ])
      if (budgetsRes.error) throw budgetsRes.error
      if (spendRes.error) throw spendRes.error

      const spendByCat = Object.fromEntries((spendRes.data ?? []).map((r) => [r.category_id, Number(r.total)]))

      const rows = (budgetsRes.data ?? []).map((b) => {
        const spent = spendByCat[b.category_id] ?? 0
        return { ...b, spent, remaining: Number(b.amount) - spent, status: budgetStatus(spent, Number(b.amount)) }
      })

      const totalBudget = rows.reduce((s, r) => s + Number(r.amount), 0)
      const totalSpent = rows.reduce((s, r) => s + r.spent, 0)

      return { rows, totalBudget, totalSpent, totalRemaining: totalBudget - totalSpent }
    },
  })
}

/** This month's expense transactions for one budgeted category (for "View details"). */
export function useBudgetCategoryTransactions(categoryId, year, month, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['budgets', 'category-tx', categoryId, year, month, user?.id],
    enabled: Boolean(user?.id && categoryId && enabled),
    queryFn: async () => {
      const monthStart = new Date(year, month - 1, 1)
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, description, transaction_date, account:accounts(name)')
        .eq('type', 'expense')
        .eq('category_id', categoryId)
        .gte('transaction_date', d(startOfMonth(monthStart)))
        .lte('transaction_date', d(endOfMonth(monthStart)))
        .order('transaction_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useBudgetMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['budgets'] })

  const upsert = useMutation({
    mutationFn: async ({ id, ...values }) => {
      if (id) {
        const { data, error } = await supabase
          .from('budgets')
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase
        .from('budgets')
        .insert({ ...values, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('budgets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { upsert, remove }
}
