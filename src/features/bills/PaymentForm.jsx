import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { format } from 'date-fns'
import { Field, TextInput, Select, MoneyInput } from '../../components/common/form'
import { renderAccountOption } from '../accounts/accountOption'
import { accountOptionLabel } from '../accounts/accountTheme'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { useBillMutations } from './useBills'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { formatCurrency } from '../../utils/format'

/**
 * Confirm & record a payment for one occurrence.
 * `recurring` is the parent definition (kind, category_id, account_id, liability).
 */
export default function PaymentForm({ occurrence, recurring, onDone }) {
  const toast = useToast()
  const { recordPayment, recordEmiPayment } = useBillMutations()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories('expense')
  const tokenRef = useRef(crypto.randomUUID())
  const isEmi = recurring?.kind === 'emi'

  const scheduled = Number(occurrence.scheduled_amount)
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      amount: scheduled,
      principal: Number(occurrence.principal_amount) || (isEmi ? scheduled : 0),
      interest: Number(occurrence.interest_amount) || 0,
      date: occurrence.due_date || format(new Date(), 'yyyy-MM-dd'),
      account_id: recurring?.account_id ?? '',
      category_id: recurring?.category_id ?? '',
      payment_method_id: recurring?.payment_method_id ?? '',
    },
  })

  const principal = Number(watch('principal')) || 0
  const interest = Number(watch('interest')) || 0
  const emiTotal = principal + interest

  const onSubmit = async (v) => {
    try {
      if (isEmi) {
        await recordEmiPayment.mutateAsync({
          occurrenceId: occurrence.id,
          amount: Number((principal + interest).toFixed(2)),
          principal: Number(principal.toFixed(2)),
          interest: Number(interest.toFixed(2)),
          date: v.date,
          accountId: v.account_id || null,
          categoryId: v.category_id || null,
          paymentMethodId: v.payment_method_id || null,
          clientToken: tokenRef.current,
        })
      } else {
        await recordPayment.mutateAsync({
          occurrenceId: occurrence.id,
          amount: Number(Number(v.amount).toFixed(2)),
          date: v.date,
          accountId: v.account_id || null,
          categoryId: v.category_id || null,
          paymentMethodId: v.payment_method_id || null,
          clientToken: tokenRef.current,
        })
      }
      toast.success('Payment recorded.')
      onDone()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-white/5">
        <p className="font-semibold">{recurring?.displayName ?? recurring?.name}</p>
        <p className="text-xs text-ink-soft">
          Scheduled amount {formatCurrency(scheduled)} · due {format(new Date(occurrence.due_date), 'dd MMM yyyy')}
          {occurrence.installment_number ? ` · installment #${occurrence.installment_number}` : ''}
        </p>
      </div>

      {isEmi ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Principal">
            <MoneyInput {...register('principal')} />
          </Field>
          <Field label="Interest">
            <MoneyInput {...register('interest')} />
          </Field>
          <div className="sm:col-span-2 rounded-lg bg-brand-50 px-3 py-2 text-xs dark:bg-white/5">
            Total payment <b>{formatCurrency(emiTotal)}</b> · cash out {formatCurrency(emiTotal)} · interest expense{' '}
            {formatCurrency(interest)} · loan reduced by {formatCurrency(principal)}
          </div>
        </div>
      ) : (
        <Field label="Payment amount">
          <MoneyInput {...register('amount')} />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment date">
          <TextInput type="date" {...register('date')} />
        </Field>
        <Field label="Account">
          <Select {...register('account_id')} renderOption={renderAccountOption(accounts ?? [])}>
            <option value="">Select account</option>
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {accountOptionLabel(a)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={isEmi ? 'Interest expense category' : 'Category'}>
        <Select {...register('category_id')}>
          <option value="">Select category</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          Confirm payment
        </button>
      </div>
    </form>
  )
}
