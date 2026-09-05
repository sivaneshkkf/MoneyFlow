import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Modal from '../../components/common/Modal'
import TransactionForm from '../transactions/TransactionForm'
import LendingForm from '../lending/LendingForm'
import GoalForm from '../goals/GoalForm'
import BudgetForm from '../budgets/BudgetForm'

const QuickActionsContext = createContext(null)

export function QuickActionsProvider({ children }) {
  const [action, setAction] = useState(null) // 'expense' | 'income' | 'lending' | 'goal' | 'budget'
  const open = useCallback((a) => setAction(a), [])
  const close = useCallback(() => setAction(null), [])

  const now = new Date()

  const value = useMemo(() => ({ open, close }), [open, close])

  return (
    <QuickActionsContext.Provider value={value}>
      {children}

      <Modal
        open={action === 'expense' || action === 'income'}
        onClose={close}
        title={action === 'income' ? 'Add income' : 'Add expense'}
      >
        <TransactionForm lockedType={action === 'income' ? 'income' : 'expense'} onDone={close} />
      </Modal>

      <Modal open={action === 'lending'} onClose={close} title="Add lent money" size="lg">
        <LendingForm onDone={close} />
      </Modal>

      <Modal open={action === 'goal'} onClose={close} title="Create goal">
        <GoalForm onDone={close} />
      </Modal>

      <Modal open={action === 'budget'} onClose={close} title="Create budget">
        <BudgetForm year={now.getFullYear()} month={now.getMonth() + 1} onDone={close} />
      </Modal>
    </QuickActionsContext.Provider>
  )
}

export function useQuickActions() {
  const ctx = useContext(QuickActionsContext)
  if (!ctx) throw new Error('useQuickActions must be used within QuickActionsProvider')
  return ctx
}
