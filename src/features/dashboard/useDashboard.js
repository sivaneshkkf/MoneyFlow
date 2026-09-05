import { useQuery } from '@tanstack/react-query'
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { fetchFinancialSummary, fetchMonthlySummary } from '../../services/financialMetricsService'

const d = (x) => format(x, 'yyyy-MM-dd')

export const RANGE_OPTIONS = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '3m', label: '3 months', days: 90 },
  { key: '6m', label: '6 months', days: 180 },
  { key: '12m', label: '12 months', days: 365 },
]

/** Headline metric cards + savings + lending exposure. */
export function useDashboardMetrics() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard', 'metrics', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const now = new Date()
      const prevMonth = subMonths(now, 1)
      const [summary, goalsRes, cur, prev] = await Promise.all([
        fetchFinancialSummary(),
        supabase.from('savings_goals').select('current_amount').neq('status', 'archived'),
        fetchMonthlySummary(now.getFullYear(), now.getMonth() + 1),
        fetchMonthlySummary(prevMonth.getFullYear(), prevMonth.getMonth() + 1),
      ])
      if (goalsRes.error) throw goalsRes.error

      const goalSavings = (goalsRes.data ?? []).reduce((s, g) => s + Number(g.current_amount), 0)
      const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0)

      return {
        // --- position (point-in-time, from get_financial_summary) ---
        availableBalance: summary.availableBalance,
        balance: summary.availableBalance, // backwards-compatible alias
        creditCardDebt: summary.creditCardDebt,
        creditLimit: summary.creditLimit,
        availableCredit: summary.availableCredit,
        creditUtilization: summary.creditUtilization,
        netWorth: summary.netWorth,
        moneyLent: summary.moneyLent,
        receivable: summary.receivable,
        principalReceived: summary.principalReceived,
        interestEarned: summary.interestReceived,
        overdue: summary.overdue,
        borrowerCount: summary.borrowerCount,
        loanLiabilities: summary.loanLiabilities,
        goalSavings,
        savings: goalSavings, // backwards-compatible alias (goal savings pot)
        // --- current month operating figures (from get_monthly_financial_summary) ---
        income: cur.income,
        expenses: cur.expenses,
        netSavings: cur.netSavings, // income − expenses (money lent NOT subtracted)
        cashFlow: cur.cashFlow, // income − expenses − lent + principal received
        savingsRate: cur.savingsRate,
        monthMoneyLent: cur.moneyLent, // principal lent THIS month
        monthPrincipalReceived: cur.principalReceived, // principal repaid THIS month
        monthInterestReceived: cur.interestReceived,
        changes: {
          income: pct(cur.income, prev.income),
          expenses: pct(cur.expenses, prev.expenses),
          savings: pct(cur.netSavings, prev.netSavings),
        },
      }
    },
  })
}

/** Cash-flow series bucketed by day (<=30d) or month. */
export function useCashFlow(rangeKey = '30d') {
  const { user } = useAuth()
  const range = RANGE_OPTIONS.find((r) => r.key === rangeKey) ?? RANGE_OPTIONS[1]
  return useQuery({
    queryKey: ['dashboard', 'cashflow', rangeKey, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const now = new Date()
      const from = subDays(now, range.days)
      const monthly = range.days > 45
      const fromKey = d(monthly ? startOfMonth(from) : from)

      const [tx, lent, repaid, loanPaid] = await Promise.all([
        supabase.from('transactions').select('type, amount, transaction_date').gte('transaction_date', fromKey),
        supabase.from('lending_records').select('principal_amount, lending_date').gte('lending_date', fromKey),
        supabase
          .from('lending_repayments')
          .select('principal_amount, interest_amount, payment_date')
          .gte('payment_date', fromKey),
        supabase
          .from('recurring_payment_occurrences')
          .select('principal_amount, paid_at')
          .eq('status', 'paid')
          .gt('principal_amount', 0)
          .gte('paid_at', fromKey),
      ])
      for (const r of [tx, lent, repaid, loanPaid]) if (r.error) throw r.error

      const keyFor = (dateStr) => (monthly ? dateStr.slice(0, 7) : dateStr)
      const buckets = new Map()
      const ensure = (k) =>
        buckets.get(k) ||
        buckets
          .set(k, {
            key: k,
            income: 0,
            expenses: 0,
            moneyLent: 0,
            principalReceived: 0,
            interestReceived: 0,
            loanPrincipalPaid: 0,
          })
          .get(k)

      for (const t of tx.data ?? []) {
        const b = ensure(keyFor(t.transaction_date))
        if (t.type === 'income') b.income += Number(t.amount)
        else b.expenses += Number(t.amount)
      }
      for (const r of lent.data ?? []) ensure(keyFor(r.lending_date)).moneyLent += Number(r.principal_amount)
      for (const r of loanPaid.data ?? [])
        if (r.paid_at) ensure(keyFor(r.paid_at)).loanPrincipalPaid += Number(r.principal_amount)
      for (const r of repaid.data ?? []) {
        const b = ensure(keyFor(r.payment_date))
        b.principalReceived += Number(r.principal_amount)
        b.interestReceived += Number(r.interest_amount)
      }

      const spine = monthly
        ? eachMonthOfInterval({ start: from, end: now }).map((m) => format(m, 'yyyy-MM'))
        : eachDayOfInterval({ start: from, end: now }).map((x) => d(x))

      return spine.map((k) => {
        const b =
          buckets.get(k) ??
          { income: 0, expenses: 0, moneyLent: 0, principalReceived: 0, interestReceived: 0, loanPrincipalPaid: 0 }
        // interest is already inside b.income (it is an income transaction); loan
        // interest is already inside b.expenses. Only the loan principal paydown
        // is an extra cash outflow not represented as a transaction.
        const net = b.income - b.expenses - b.moneyLent + b.principalReceived - b.loanPrincipalPaid
        return {
          label: monthly ? format(new Date(`${k}-01`), 'MMM') : format(new Date(k), 'dd MMM'),
          ...b,
          net,
        }
      })
    },
  })
}

/** Spending by category + a category × day-of-week heatmap for the current month. */
export function useSpendingBreakdown() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard', 'spending', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const now = new Date()
      const from = d(startOfMonth(now))
      const to = d(endOfMonth(now))

      const [summary, rows] = await Promise.all([
        supabase.rpc('get_category_expense_summary', { p_from: from, p_to: to }),
        supabase
          .from('transactions')
          .select('amount, transaction_date, category:categories(name)')
          .eq('type', 'expense')
          .gte('transaction_date', from)
          .lte('transaction_date', to),
      ])
      if (summary.error) throw summary.error
      if (rows.error) throw rows.error

      const categories = (summary.data ?? []).map((c) => ({
        name: c.category_name,
        value: Number(c.total),
        color: c.color ?? '#7C9B95',
      }))
      const total = categories.reduce((s, c) => s + c.value, 0)

      // heatmap: category (rows) × weekday (cols)
      const grid = {}
      for (const r of rows.data ?? []) {
        const name = r.category?.name ?? 'Uncategorized'
        const dow = new Date(r.transaction_date).getDay()
        grid[name] = grid[name] || Array(7).fill(0)
        grid[name][dow] += Number(r.amount)
      }
      const heatmap = Object.entries(grid)
        .map(([name, cells]) => ({ name, cells, total: cells.reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)
      const maxCell = Math.max(1, ...heatmap.flatMap((h) => h.cells))

      return { categories, total, heatmap, maxCell }
    },
  })
}

/** Upcoming + overdue repayments for the dashboard. */
export function useUpcomingRepayments() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard', 'upcoming-repayments', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lending_records')
        .select(
          'id, borrower_name, due_date, next_due_date, next_due_amount, overdue_amount, overdue_installments, schedule_generated, outstanding_principal, outstanding_interest, status',
        )
        .in('status', ['active', 'partially_paid', 'overdue'])
        .order('next_due_date', { ascending: true, nullsFirst: false })
        .limit(8)
      if (error) throw error
      return (data ?? [])
        .map((r) => {
          const outstanding = Number(r.outstanding_principal) + Number(r.outstanding_interest)
          const nextDue = r.schedule_generated ? r.next_due_date : r.due_date
          return {
            ...r,
            outstanding,
            nextDue,
            nextDueAmount: r.schedule_generated ? Number(r.next_due_amount) : outstanding,
            overdueAmount: Number(r.overdue_amount ?? 0),
            overdueCount: Number(r.overdue_installments ?? 0),
          }
        })
        .filter((r) => r.nextDue && r.outstanding > 0.005)
        .sort((a, b) => new Date(a.nextDue) - new Date(b.nextDue))
        .slice(0, 6)
    },
  })
}

export function useDashboardGoals() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard', 'goals', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(4)
      if (error) throw error
      return data ?? []
    },
  })
}
