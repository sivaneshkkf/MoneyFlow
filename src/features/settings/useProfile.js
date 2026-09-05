import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      if (error) throw error
      // Fallback so the UI still renders before the profile row exists.
      return (
        data ?? {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name ?? '',
          avatar_url: user.user_metadata?.avatar_url ?? null,
          currency: 'INR',
          timezone: 'Asia/Kolkata',
        }
      )
    },
  })
}

export function useUploadAvatar() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file) => {
      if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
      if (file.size > 3 * 1024 * 1024) throw new Error('Image must be under 3 MB.')
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${user.id}/avatar-${Date.now()}.${ext}`
      const up = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      })
      if (up.error) throw up.error
      const signed = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60 * 24 * 365)
      if (signed.error) throw signed.error
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: signed.data.signedUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
      return signed.data.signedUrl
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', user?.id] }),
  })
}

export function useUpdateProfile() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', user?.id] }),
  })
}
