import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

// Grouped global search across the user's core records.
export function useGlobalSearch(term) {
  const { user } = useAuth()
  const q = (term ?? '').trim()
  return useQuery({
    queryKey: ['global-search', q, user?.id],
    enabled: Boolean(user?.id && q.length >= 2),
    queryFn: async () => {
      const like = `%${q}%`
      const [tx, lending, accounts, categories, goals] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, description, amount, type, transaction_date')
          .or(`description.ilike.${like},notes.ilike.${like}`)
          .order('transaction_date', { ascending: false })
          .limit(5),
        supabase
          .from('lending_records')
          .select('id, borrower_name, outstanding_principal, outstanding_interest, status')
          .ilike('borrower_name', like)
          .limit(5),
        supabase.from('accounts').select('id, name, current_balance').ilike('name', like).limit(5),
        supabase.from('categories').select('id, name, type').ilike('name', like).limit(5),
        supabase.from('savings_goals').select('id, name, current_amount, target_amount').ilike('name', like).limit(5),
      ])

      return {
        transactions: tx.data ?? [],
        lending: lending.data ?? [],
        accounts: accounts.data ?? [],
        categories: categories.data ?? [],
        goals: goals.data ?? [],
      }
    },
  })
}
