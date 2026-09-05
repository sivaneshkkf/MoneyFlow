import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Field, TextInput, Textarea, Select, MoneyInput } from '../../components/common/form'
import { useCategories } from '../categories/useCategories'
import { useAccounts } from '../accounts/useAccounts'
import { accountOptionLabel } from '../accounts/accountTheme'
import { renderAccountOption } from '../accounts/accountOption'
import { usePaymentMethods } from '../settings/usePaymentMethods'
import { useTransactionMutations } from './useTransactions'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const schema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  transaction_date: z.string().min(1, 'Pick a date'),
  category_id: z.string().uuid('Choose a category').optional().or(z.literal('')),
  account_id: z.string().uuid('Choose an account').optional().or(z.literal('')),
  payment_method_id: z.string().optional().or(z.literal('')),
  description: z.string().max(120).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
})

export default function TransactionForm({ initial, lockedType, onDone }) {
  const toast = useToast()
  const { create, update } = useTransactionMutations()
  const editing = Boolean(initial?.id)
  const type = lockedType || initial?.type || 'expense'

  const { data: categories = [] } = useCategories(type)
  const { data: accounts = [] } = useAccounts()
  const { data: methods = [] } = usePaymentMethods()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      type,
      amount: initial?.amount ?? '',
      transaction_date: initial?.transaction_date ?? format(new Date(), 'yyyy-MM-dd'),
      category_id: initial?.category_id ?? '',
      account_id: initial?.account_id ?? '',
      payment_method_id: initial?.payment_method_id ?? '',
      description: initial?.description ?? '',
      notes: initial?.notes ?? '',
    },
  })

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      type,
      category_id: values.category_id || null,
      account_id: values.account_id || null,
      payment_method_id: values.payment_method_id || null,
      description: values.description || null,
      notes: values.notes || null,
    }
    try {
      if (editing) await update.mutateAsync({ id: initial.id, ...payload })
      else await create.mutateAsync(payload)
      toast.success(editing ? 'Transaction updated.' : `${type === 'income' ? 'Income' : 'Expense'} added.`)
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to save this transaction. Please try again.'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" error={errors.amount?.message}>
          <MoneyInput {...register('amount')} autoFocus />
        </Field>
        <Field label="Date" error={errors.transaction_date?.message}>
          <TextInput type="date" {...register('transaction_date')} />
        </Field>
      </div>

      <Field label="Category" error={errors.category_id?.message}>
        <Select {...register('category_id')}>
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Account" error={errors.account_id?.message}>
          <Select renderOption={renderAccountOption(accounts)} {...register('account_id')}>
            <option value="">No account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountOptionLabel(a)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment method">
          <Select {...register('payment_method_id')}>
            <option value="">—</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" error={errors.description?.message}>
        <TextInput placeholder="e.g. Grocery run at BigBasket" {...register('description')} />
      </Field>

      <Field label="Notes">
        <Textarea {...register('notes')} />
      </Field>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
        </button>
      </div>
    </form>
  )
}
