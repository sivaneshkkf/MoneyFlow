import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

export function useGoals(includeArchived = false) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['goals', { includeArchived }, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      let q = supabase.from('savings_goals').select('*').order('created_at', { ascending: true })
      if (!includeArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}

export function useGoalContributions(goalId) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['goal_contributions', goalId, user?.id],
    enabled: Boolean(user?.id && goalId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goal_contributions')
        .select('*, account:accounts(name)')
        .eq('goal_id', goalId)
        .order('contribution_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useGoalMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['goals'] })
    qc.invalidateQueries({ queryKey: ['goal_contributions'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const create = useMutation({
    mutationFn: async (values) => {
      const { data, error } = await supabase
        .from('savings_goals')
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
        .from('savings_goals')
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
    mutationFn: async (id) => {
      const { error } = await supabase.from('savings_goals').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // amount > 0 = add money, amount < 0 = withdraw. Trigger keeps current_amount in sync.
  const contribute = useMutation({
    mutationFn: async ({ goalId, amount, account_id, notes }) => {
      const { error } = await supabase.from('goal_contributions').insert({
        goal_id: goalId,
        user_id: user.id,
        amount,
        account_id: account_id || null,
        notes: notes || null,
        contribution_date: format(new Date(), 'yyyy-MM-dd'),
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Transfer between two goals (withdraw from one, add to the other).
  const moveFunds = useMutation({
    mutationFn: async ({ fromGoalId, toGoalId, amount }) => {
      const date = format(new Date(), 'yyyy-MM-dd')
      const amt = Math.abs(Number(amount))
      const out = await supabase.from('goal_contributions').insert({
        goal_id: fromGoalId,
        user_id: user.id,
        amount: -amt,
        notes: 'Moved to another goal',
        contribution_date: date,
      })
      if (out.error) throw out.error
      const inn = await supabase.from('goal_contributions').insert({
        goal_id: toGoalId,
        user_id: user.id,
        amount: amt,
        notes: 'Moved from another goal',
        contribution_date: date,
      })
      if (inn.error) throw inn.error
    },
    onSuccess: invalidate,
  })

  return { create, update, remove, contribute, moveFunds }
}
