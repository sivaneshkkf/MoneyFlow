import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const KEY = ['categories']

export function useCategories(type) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...KEY, type ?? 'all'],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      let q = supabase.from('categories').select('*').order('name')
      if (type) q = q.eq('type', type)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

export function useCategoryMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY })

  const create = useMutation({
    mutationFn: async (values) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ ...values, user_id: user.id, is_default: false })
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
        .from('categories')
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
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
