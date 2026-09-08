import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { isCredit } from '../accounts/accountTheme'

const KEY = ['creditCardBills']

/** Every credit card account + its most recent statement (if any generated yet). */
export function useCreditCardBills() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...KEY, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data: accounts, error: aerr } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      if (aerr) throw aerr
      const cards = (accounts ?? []).filter(isCredit)
      if (cards.length === 0) return []

      const { data: statements, error: serr } = await supabase
        .from('credit_card_statements')
        .select('*')
        .in('account_id', cards.map((a) => a.id))
        .order('period_start', { ascending: false })
      if (serr) throw serr

      const latestByAccount = new Map()
      for (const s of statements ?? []) {
        if (!latestByAccount.has(s.account_id)) latestByAccount.set(s.account_id, s)
      }
      return cards.map((account) => ({ account, statement: latestByAccount.get(account.id) ?? null }))
    },
  })
}

export function useCreditCardMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY })
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  // Sums the card's real transactions for the period -- never creates one.
  const generateStatement = useMutation({
    mutationFn: async ({ accountId, periodStart, periodEnd, dueDate }) => {
      const { data, error } = await supabase.rpc('generate_credit_card_statement', {
        p_account: accountId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_due_date: dueDate,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  // Pure cash movement (source account down, card outstanding down) --
  // never creates a transaction, never a second expense.
  const payBill = useMutation({
    mutationFn: async ({ accountId, sourceAccountId, amount, statementId, date, notes, clientToken }) => {
      const { data, error } = await supabase.rpc('pay_credit_card_bill', {
        p_account: accountId,
        p_source_account: sourceAccountId,
        p_amount: amount,
        p_statement_id: statementId ?? null,
        p_date: date,
        p_notes: notes || null,
        p_client_token: clientToken ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  return { generateStatement, payBill }
}
