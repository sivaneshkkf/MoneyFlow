import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, eachMonthOfInterval, format, subDays } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const d = (x) => format(x, 'yyyy-MM-dd')

export const ANALYTICS_RANGES = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '3m', label: '3 months', days: 90 },
  { key: '6m', label: '6 months', days: 180 },
  { key: '12m', label: '12 months', days: 365 },
]

const pctChange = (a, b) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0)

async function windowTotals(fromKey, toKey) {
  const [tx, repaid] = await Promise.all([
    supabase.from('transactions').select('type, amount').gte('transaction_date', fromKey).lte('transaction_date', toKey),
    supabase.from('lending_repayments').select('principal_amount').gte('payment_date', fromKey).lte('payment_date', toKey),
  ])
  if (tx.error) throw tx.error
  if (repaid.error) throw repaid.error
  let income = 0
  let expenses = 0
  for (const t of tx.data ?? []) {
    if (t.type === 'income') income += Number(t.amount)
    else expenses += Number(t.amount)
  }
  const principalReceived = (repaid.data ?? []).reduce((s, r) => s + Number(r.principal_amount), 0)
  const netSavings = income - expenses
  return {
    income,
    expenses,
    netSavings,
    savingsRate: income > 0 ? (netSavings / income) * 100 : 0,
    principalReceived,
  }
}

export function useAnalytics(rangeKey = '3m', custom) {
  const { user } = useAuth()
  const range = ANALYTICS_RANGES.find((r) => r.key === rangeKey) ?? ANALYTICS_RANGES[2]
  const now = new Date()
  const from = custom?.from ? new Date(custom.from) : subDays(now, range.days)
  const to = custom?.to ? new Date(custom.to) : now
  const fromKey = d(from)
  const toKey = d(to)
  const spanDays = Math.max(1, differenceInCalendarDays(to, from))
  const prevToKey = d(subDays(from, 1))
  const prevFromKey = d(subDays(from, 1 + spanDays))

  return useQuery({
    queryKey: ['analytics', 'overview', rangeKey, fromKey, toKey, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const [tx, lent, repaid, goals, prev] = await Promise.all([
        supabase
          .from('transactions')
          .select('type, amount, transaction_date, category:categories(name,color)')
          .gte('transaction_date', fromKey)
          .lte('transaction_date', toKey),
        supabase
          .from('lending_records')
          .select('principal_amount, lending_date')
          .gte('lending_date', fromKey)
          .lte('lending_date', toKey),
        supabase
          .from('lending_repayments')
          .select('amount, principal_amount, interest_amount, payment_date')
          .gte('payment_date', fromKey)
          .lte('payment_date', toKey),
        supabase.from('savings_goals').select('current_amount, target_amount, status'),
        windowTotals(prevFromKey, prevToKey),
      ])
      for (const r of [tx, lent, repaid, goals]) if (r.error) throw r.error

      let income = 0
      let expenses = 0
      const incomeByCat = {}
      const expenseByCat = {}
      const months = {}
      const monthKeys = eachMonthOfInterval({ start: from, end: to }).map((m) => format(m, 'yyyy-MM'))
      monthKeys.forEach((k) => {
        months[k] = {
          key: k,
          month: format(new Date(`${k}-01`), 'MMM yy'),
          income: 0,
          expenses: 0,
          net: 0,
          lent: 0,
          recovered: 0,
        }
      })

      for (const t of tx.data ?? []) {
        const amt = Number(t.amount)
        const mk = t.transaction_date.slice(0, 7)
        const name = t.category?.name ?? 'Uncategorized'
        const color = t.category?.color ?? '#7C9B95'
        if (t.type === 'income') {
          income += amt
          incomeByCat[name] = incomeByCat[name] || { name, value: 0, color }
          incomeByCat[name].value += amt
          if (months[mk]) months[mk].income += amt
        } else {
          expenses += amt
          expenseByCat[name] = expenseByCat[name] || { name, value: 0, color }
          expenseByCat[name].value += amt
          if (months[mk]) months[mk].expenses += amt
        }
      }

      let moneyLent = 0
      for (const r of lent.data ?? []) {
        moneyLent += Number(r.principal_amount)
        const mk = r.lending_date.slice(0, 7)
        if (months[mk]) months[mk].lent += Number(r.principal_amount)
      }

      let principalReceived = 0
      let interestReceived = 0
      for (const r of repaid.data ?? []) {
        principalReceived += Number(r.principal_amount)
        interestReceived += Number(r.interest_amount)
        const mk = r.payment_date.slice(0, 7)
        if (months[mk]) months[mk].recovered += Number(r.amount)
      }

      Object.values(months).forEach((m) => {
        m.net = m.income - m.expenses
      })

      const netSavings = income - expenses
      const cashFlow = income - expenses - moneyLent + principalReceived
      const savingsRate = income > 0 ? (netSavings / income) * 100 : 0
      const totalSaved = (goals.data ?? [])
        .filter((g) => g.status !== 'archived')
        .reduce((s, g) => s + Number(g.current_amount), 0)

      return {
        range: { from: fromKey, to: toKey },
        income,
        expenses,
        netSavings,
        cashFlow,
        savingsRate,
        moneyLent,
        principalReceived,
        interestReceived,
        recoveryPct: moneyLent > 0 ? ((principalReceived + interestReceived) / moneyLent) * 100 : 0,
        totalSaved,
        incomeByCategory: Object.values(incomeByCat).sort((a, b) => b.value - a.value),
        expenseByCategory: Object.values(expenseByCat).sort((a, b) => b.value - a.value),
        monthly: Object.values(months),
        changes: {
          income: pctChange(income, prev.income),
          expenses: pctChange(expenses, prev.expenses),
          netSavings: pctChange(netSavings, prev.netSavings),
          savingsRate: savingsRate - prev.savingsRate,
          principalReceived: pctChange(principalReceived, prev.principalReceived),
        },
      }
    },
  })
}
