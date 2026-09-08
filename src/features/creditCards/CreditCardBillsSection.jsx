import { useState } from 'react'
import { CreditCard, FileClock, Wallet } from 'lucide-react'
import { Badge, Skeleton } from '../../components/common'
import Modal from '../../components/common/Modal'
import { formatCurrency, formatDate } from '../../utils/format'
import { accountOptionLabel } from '../accounts/accountTheme'
import { useCreditCardBills } from './useCreditCards'
import PayCreditCardBillForm from './PayCreditCardBillForm'
import GenerateStatementForm from './GenerateStatementForm'

const STATUS_META = {
  unpaid: { label: 'Unpaid', tone: 'warning' },
  partially_paid: { label: 'Partially paid', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
}

function outstandingOf(account) {
  return Number(account.metadata?.current_outstanding ?? 0)
}
function creditLimitOf(account) {
  return Number(account.metadata?.credit_limit ?? 0)
}

/**
 * "Credit Card Bills" — separate from the regular Bills & Recurring list on
 * purpose (see 041_credit_card_statements.sql): a card's bill amount isn't
 * fixed, so it can't be a normal recurring bill. Each card's outstanding
 * balance already updates itself from real purchases (the migration's
 * transactions trigger); this only surfaces it + lets you generate a
 * statement and pay it down.
 */
export default function CreditCardBillsSection() {
  const { data: cards, isLoading } = useCreditCardBills()
  const [payTarget, setPayTarget] = useState(null) // { account, statement }
  const [statementTarget, setStatementTarget] = useState(null) // account

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (!cards || cards.length === 0) return null

  return (
    <div className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
        <CreditCard className="h-4 w-4 text-ink-soft" /> Credit Card Bills
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ account, statement }) => {
          const outstanding = outstandingOf(account)
          const limit = creditLimitOf(account)
          const availableCredit = limit > 0 ? Math.max(0, limit - outstanding) : null
          const due = statement ? Math.max(0, Number(statement.statement_amount) - Number(statement.paid_amount)) : null
          const sm = statement ? STATUS_META[statement.status] : null
          const overdue = statement && statement.status !== 'paid' && statement.due_date < formatDate(new Date(), 'yyyy-MM-dd')

          return (
            <div key={account.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{accountOptionLabel(account)}</p>
                  {statement ? (
                    <p className="text-xs text-ink-soft">
                      {formatDate(statement.period_start)} – {formatDate(statement.period_end)}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-soft">No statement generated yet</p>
                  )}
                </div>
                {sm && <Badge tone={overdue ? 'danger' : sm.tone}>{overdue ? 'Overdue' : sm.label}</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-ink-soft">Current outstanding</p>
                  <p className="text-lg font-bold">{formatCurrency(outstanding)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-soft">{statement ? 'Amount due' : 'Available credit'}</p>
                  <p className="text-lg font-bold">
                    {statement ? formatCurrency(due) : availableCredit != null ? formatCurrency(availableCredit) : '—'}
                  </p>
                </div>
              </div>

              {statement && (
                <p className="text-xs text-ink-soft">
                  Due {formatDate(statement.due_date)}
                  {due > 0 && due < Number(statement.statement_amount) ? ` · ${formatCurrency(due)} remaining` : ''}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost !py-1.5 flex-1 text-xs"
                  onClick={() => setStatementTarget(account)}
                >
                  <FileClock className="h-3.5 w-3.5" /> Generate statement
                </button>
                {outstanding > 0.005 && (
                  <button
                    type="button"
                    className="btn-primary !py-1.5 flex-1 text-xs"
                    onClick={() => setPayTarget({ account, statement })}
                  >
                    <Wallet className="h-3.5 w-3.5" /> Pay bill
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Modal open={Boolean(payTarget)} onClose={() => setPayTarget(null)} title="Pay credit card bill">
        {payTarget && (
          <PayCreditCardBillForm
            card={payTarget.account}
            statement={payTarget.statement}
            outstanding={outstandingOf(payTarget.account)}
            onDone={() => setPayTarget(null)}
          />
        )}
      </Modal>
      <Modal open={Boolean(statementTarget)} onClose={() => setStatementTarget(null)} title="Generate statement">
        {statementTarget && <GenerateStatementForm card={statementTarget} onDone={() => setStatementTarget(null)} />}
      </Modal>
    </div>
  )
}
