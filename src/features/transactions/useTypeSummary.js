import { useQuery } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const d = (x) => format(x, 'yyyy-MM-dd')

// Aggregates for the Income / Expenses landing pages: this month, last month,
// all-time total, and a per-category / per-month breakdown for the current year.
export function useTypeSummary(type) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['analytics', 'type-summary', type, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const now = new Date()
      const thisStart = d(startOfMonth(now))
      const thisEnd = d(endOfMonth(now))
      const lastStart = d(startOfMonth(subMonths(now, 1)))
      const lastEnd = d(endOfMonth(subMonths(now, 1)))
      const priorStart = d(startOfMonth(subMonths(now, 2)))
      const priorEnd = d(endOfMonth(subMonths(now, 2)))
      const yearStart = d(startOfMonth(subMonths(now, 11)))

      const { data, error } = await supabase
        .from('transactions')
        .select('amount, transaction_date, category:categories(name,color)')
        .eq('type', type)
        .gte('transaction_date', yearStart)
      if (error) throw error

      let thisMonth = 0
      let lastMonth = 0
      let priorMonth = 0
      let allTime = 0
      const byCategory = {}
      const byCategoryThisMonth = {}
      const byMonth = {}

      for (const row of data) {
        const amt = Number(row.amount)
        allTime += amt
        const date = row.transaction_date
        const inThisMonth = date >= thisStart && date <= thisEnd
        if (inThisMonth) thisMonth += amt
        if (date >= lastStart && date <= lastEnd) lastMonth += amt
        if (date >= priorStart && date <= priorEnd) priorMonth += amt
        const name = row.category?.name ?? 'Uncategorized'
        const color = row.category?.color ?? '#7C9B95'
        byCategory[name] = byCategory[name] || { name, value: 0, color }
        byCategory[name].value += amt
        if (inThisMonth) {
          byCategoryThisMonth[name] = byCategoryThisMonth[name] || { name, value: 0, color }
          byCategoryThisMonth[name].value += amt
        }
        const mk = date.slice(0, 7)
        byMonth[mk] = (byMonth[mk] || 0) + amt
      }

      const months = []
      for (let i = 11; i >= 0; i--) {
        const mk = format(subMonths(now, i), 'yyyy-MM')
        months.push({ month: format(subMonths(now, i), 'MMM'), value: byMonth[mk] || 0 })
      }

      const categories = Object.values(byCategory).sort((a, b) => b.value - a.value)
      const categoriesThisMonth = Object.values(byCategoryThisMonth).sort((a, b) => b.value - a.value)
      const pctChange = (a, b) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0)

      return {
        thisMonth,
        lastMonth,
        priorMonth,
        allTime,
        change: pctChange(thisMonth, lastMonth),
        changeVsPrior: pctChange(lastMonth, priorMonth),
        categories,
        categoriesThisMonth,
        months,
        topCategory: categories[0] ?? null,
        topThisMonth: categoriesThisMonth[0] ?? null,
      }
    },
  })
}
