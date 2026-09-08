import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Field, TextInput, Textarea, Select, MoneyInput } from '../../components/common/form'
import { useAccounts } from '../accounts/useAccounts'
import { renderAccountOption } from '../accounts/accountOption'
import { accountOptionLabel, isCredit } from '../accounts/accountTheme'
import { useCreditCardMutations } from './useCreditCards'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { formatCurrency } from '../../utils/format'

const schema = z.object({
  source_account_id: z.string().uuid('Choose an account to pay from'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  payment_date: z.string().min(1, 'Pick a date'),
  notes: z.string().max(300).optional().or(z.literal('')),
})

/**
 * Pay down a credit card's outstanding balance from a real cash account.
 * This is a debt settlement, not an expense — the original purchases were
 * already recorded as expenses when they happened (see
 * apply_credit_card_outstanding()). pay_credit_card_bill() never creates a
 * transaction, so this can never double-count. The RPC is the real
 * overpayment guard (never trust the client alone) — this form's check is
 * just for a fast, friendly error before the round trip.
 */
export default function PayCreditCardBillForm({ card, statement, outstanding, onDone }) {
  const toast = useToast()
  const { payBill } = useCreditCardMutations()
  const { data: accounts = [] } = useAccounts()
  const sourceAccounts = accounts.filter((a) => !isCredit(a))
  const tokenRef = useRef(crypto.randomUUID())
  const defaultSourceId = card.metadata?.default_payment_account_id
  const defaultSourceValid = sourceAccounts.some((a) => a.id === defaultSourceId)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      source_account_id: defaultSourceValid ? defaultSourceId : '',
      amount: outstanding,
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    },
  })

  const onSubmit = async (v) => {
    if (Number(v.amount) > outstanding + 0.005) {
      setError('amount', { message: `Cannot exceed the outstanding balance of ${formatCurrency(outstanding)}` })
      return
    }
    try {
      await payBill.mutateAsync({
        accountId: card.id,
        sourceAccountId: v.source_account_id,
        amount: Number(v.amount),
        statementId: statement?.id ?? null,
        date: v.payment_date,
        notes: v.notes.trim() || null,
        clientToken: tokenRef.current,
      })
      toast.success('Payment recorded.')
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  if (sourceAccounts.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-soft">
        You need at least one non-credit-card account to pay this bill from.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-white/5">
        <p className="font-semibold">{accountOptionLabel(card)}</p>
        <p className="text-xs text-ink-soft">Outstanding balance: {formatCurrency(outstanding)}</p>
      </div>

      <Field label="Pay from" error={errors.source_account_id?.message}>
        <Select renderOption={renderAccountOption(sourceAccounts)} {...register('source_account_id')}>
          <option value="">Select account</option>
          {sourceAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {accountOptionLabel(a)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Amount (₹)" error={errors.amount?.message} hint="Defaults to the full outstanding balance — reduce it for a partial payment.">
        <MoneyInput {...register('amount')} placeholder="0.00" />
      </Field>

      <Field label="Payment date" error={errors.payment_date?.message}>
        <TextInput type="date" {...register('payment_date')} />
      </Field>

      <Field label="Notes (optional)">
        <Textarea {...register('notes')} rows={2} />
      </Field>

      <p className="text-xs text-ink-soft">
        This settles debt, not a new expense — the purchases were already recorded when you made them.
      </p>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Paying…' : 'Pay bill'}
        </button>
      </div>
    </form>
  )
}
