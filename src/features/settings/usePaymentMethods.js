import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const KEY = ['payment_methods']

export function usePaymentMethods() {
  const { user } = useAuth()
  return useQuery({
    queryKey: KEY,
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function usePaymentMethodMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY })

  const create = useMutation({
    mutationFn: async (values) => {
      const { data, error } = await supabase
        .from('payment_methods')
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
        .from('payment_methods')
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
      const { error } = await supabase.from('payment_methods').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const reorder = useMutation({
    mutationFn: async (orderedIds) => {
      const results = await Promise.all(
        orderedIds.map((id, i) =>
          supabase.from('payment_methods').update({ sort_order: i }).eq('id', id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed) throw failed.error
    },
    onSuccess: invalidate,
  })

  return { create, update, remove, reorder }
}
