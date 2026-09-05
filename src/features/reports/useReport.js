import { useQuery } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const d = (x) => format(x, 'yyyy-MM-dd')

export function useMonthlyReport(year, month) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['report', 'monthly', year, month, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const start = new Date(year, month - 1, 1)
      const from = d(startOfMonth(start))
      const to = d(endOfMonth(start))

      const [summary, categorySpend, lending] = await Promise.all([
        supabase.rpc('get_monthly_financial_summary', { p_year: year, p_month: month }),
        supabase.rpc('get_category_expense_summary', { p_from: from, p_to: to }),
        supabase.rpc('get_lending_summary'),
      ])
      for (const r of [summary, categorySpend, lending]) if (r.error) throw r.error

      const s = summary.data?.[0] ?? {}
      const l = lending.data?.[0] ?? {}

      return {
        period: format(start, 'MMMM yyyy'),
        year,
        month,
        income: Number(s.income ?? 0),
        expenses: Number(s.expenses ?? 0),
        netSavings: Number(s.net_operating_savings ?? 0),
        cashFlow: Number(s.cash_flow ?? 0),
        savingsRate: Number(s.savings_rate ?? 0),
        moneyLent: Number(s.money_lent ?? 0),
        principalReceived: Number(s.principal_received ?? 0),
        interestReceived: Number(s.interest_received ?? 0),
        outstandingLending: Number(l.outstanding ?? 0),
        categories: (categorySpend.data ?? []).map((c) => ({
          name: c.category_name,
          total: Number(c.total),
          color: c.color,
        })),
      }
    },
  })
}
