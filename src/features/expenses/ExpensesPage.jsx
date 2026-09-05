import TransactionsView from '../transactions/TransactionsView'
import TypeSummaryStrip from '../transactions/TypeSummaryStrip'

export default function ExpensesPage() {
  return (
    <TransactionsView
      lockedType="expense"
      title="Expenses"
      subtitle="See where your money goes and keep it in check."
      topSlot={<TypeSummaryStrip type="expense" />}
    />
  )
}
