import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const KEY = ['accounts']

export function useAccounts({ includeInactive = false } = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...KEY, { includeInactive }],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      let q = supabase.from('accounts').select('*').order('created_at', { ascending: true })
      if (!includeInactive) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

export function useAccountMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const create = useMutation({
    mutationFn: async (values) => {
      const payload = {
        ...values,
        user_id: user.id,
        current_balance: values.opening_balance ?? 0,
      }
      const { data, error } = await supabase.from('accounts').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, ...values }) => {
      const { data, error } = await supabase
        .from('accounts')
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
      const { error } = await supabase.from('accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const recalc = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('recalculate_account_balance', { p_account_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { create, update, remove, recalc }
}
