import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      setLoading(false)
      if (event === 'SIGNED_IN' && newSession) {
        // Idempotent: creates the profile row + seeds default categories once.
        supabase.rpc('ensure_user_setup').then(({ error }) => {
          if (error) console.warn('ensure_user_setup failed', error.message)
        })
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      async signInWithPassword(email, password) {
        return supabase.auth.signInWithPassword({ email, password })
      },
      async signUp(email, password, fullName) {
        return supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
      },
      async signInWithGoogle() {
        return supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}/dashboard` },
        })
      },
      async resetPassword(email) {
        return supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
      },
      async updatePassword(password) {
        return supabase.auth.updateUser({ password })
      },
      async signOut() {
        await supabase.auth.signOut()
        queryClient.clear()
      },
    }),
    [session, loading, queryClient],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
