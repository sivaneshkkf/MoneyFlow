import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const SELECT =
  '*, category:categories(id,name,color,icon,type), account:accounts(id,name), payment_method:payment_methods(id,name)'

export function useTransactions(filters = {}) {
  const { user } = useAuth()
  const {
    type,
    search = '',
    categoryId,
    accountId,
    paymentMethodId,
    from,
    to,
    minAmount,
    maxAmount,
    sort = 'transaction_date.desc',
    page = 1,
    pageSize = 20,
  } = filters

  return useQuery({
    queryKey: ['transactions', { ...filters, user: user?.id }],
    enabled: Boolean(user?.id),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [sortCol, sortDir] = sort.split('.')
      let q = supabase.from('transactions').select(SELECT, { count: 'exact' })

      if (type) q = q.eq('type', type)
      if (categoryId) q = q.eq('category_id', categoryId)
      if (accountId) q = q.eq('account_id', accountId)
      if (paymentMethodId) q = q.eq('payment_method_id', paymentMethodId)
      if (from) q = q.gte('transaction_date', from)
      if (to) q = q.lte('transaction_date', to)
      if (minAmount != null && minAmount !== '') q = q.gte('amount', minAmount)
      if (maxAmount != null && maxAmount !== '') q = q.lte('amount', maxAmount)
      if (search.trim()) q = q.or(`description.ilike.%${search.trim()}%,notes.ilike.%${search.trim()}%`)

      q = q.order(sortCol, { ascending: sortDir === 'asc' })
      q = q.range((page - 1) * pageSize, page * pageSize - 1)

      const { data, error, count } = await q
      if (error) throw error
      return { rows: data ?? [], total: count ?? 0 }
    },
  })
}

export function useRecentTransactions(limit = 6) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['transactions', 'recent', limit, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select(SELECT)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useTransactionMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['analytics'] })
  }

  const create = useMutation({
    mutationFn: async (values) => {
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...values, user_id: user.id, source: 'manual' })
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
        .from('transactions')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('source', 'manual')
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id).eq('source', 'manual')
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
