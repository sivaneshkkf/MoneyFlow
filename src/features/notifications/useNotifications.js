import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const KEY = ['alerts']

export function useNotifications(limit = 30) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...KEY, 'list', limit, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      const rows = data ?? []
      return { rows, unread: rows.filter((a) => !a.is_read).length }
    },
  })
}

export function useNotificationMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY })

  const markRead = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('alerts').update({ is_read: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('alerts')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('alerts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { markRead, markAllRead, remove }
}
