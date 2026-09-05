// Rule-based Financial Health score (0–100). Not financial advice.
export function financialHealth({ income, expenses, savings, netSavings, overdue, receivable, balance }) {
  const parts = []

  // Savings rate (35 pts)
  const savingsRate = income > 0 ? (netSavings / income) * 100 : 0
  parts.push({ label: 'Savings rate', points: clamp(savingsRate * 1.75, 0, 35), max: 35 })

  // Emergency buffer: months of expenses covered by balance + savings (30 pts)
  const monthlyExpense = expenses || 1
  const months = (balance + savings) / monthlyExpense
  parts.push({ label: 'Emergency buffer', points: clamp((months / 6) * 30, 0, 30), max: 30 })

  // Expense control: expenses vs income (20 pts)
  const ratio = income > 0 ? expenses / income : 1
  parts.push({ label: 'Expense control', points: clamp((1 - ratio) * 40, 0, 20), max: 20 })

  // Lending health: overdue drag (15 pts)
  const overdueDrag = receivable > 0 ? overdue / receivable : 0
  parts.push({ label: 'Lending health', points: clamp((1 - overdueDrag) * 15, 0, 15), max: 15 })

  const score = Math.round(parts.reduce((s, p) => s + p.points, 0))
  const band =
    score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Needs Attention' : 'At Risk'
  const tone = score >= 80 ? 'success' : score >= 60 ? 'info' : score >= 40 ? 'warning' : 'danger'

  return { score, band, tone, parts, savingsRate }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0))
}
