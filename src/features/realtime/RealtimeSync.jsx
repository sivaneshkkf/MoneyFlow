import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

// Selective realtime: refresh cached queries when the user's own rows change
// elsewhere (another device/tab). RLS already scopes the stream to this user.
const WATCH = {
  transactions: ['transactions', 'dashboard', 'analytics'],
  lending_records: ['lending', 'dashboard'],
  lending_repayments: ['lending', 'dashboard', 'analytics'],
  alerts: ['alerts'],
  recurring_transactions: ['bills', 'dashboard'],
  recurring_payment_occurrences: ['bills', 'dashboard'],
  liabilities: ['bills', 'dashboard'],
  user_subscriptions: ['subscription', 'dashboard'],
  custom_plan_requests: ['subscription', 'admin'],
}

export default function RealtimeSync() {
  const { user } = useAuth()
  const qc = useQueryClient()

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase.channel(`user-sync-${user.id}`)

    Object.entries(WATCH).forEach(([table, keys]) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${user.id}` },
        () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
      )
    })

    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, qc])

  return null
}
