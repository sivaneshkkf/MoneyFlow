import TransactionsView from '../transactions/TransactionsView'
import TypeSummaryStrip from '../transactions/TypeSummaryStrip'

export default function IncomePage() {
  return (
    <TransactionsView
      lockedType="income"
      title="Income"
      subtitle="Track every source of money coming in."
      topSlot={<TypeSummaryStrip type="income" />}
    />
  )
}
