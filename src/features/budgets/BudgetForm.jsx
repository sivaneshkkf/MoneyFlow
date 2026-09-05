import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Field, Select, Textarea, MoneyInput } from '../../components/common/form'
import { useCategories } from '../categories/useCategories'
import { useBudgetMutations } from './useBudgets'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const schema = z.object({
  category_id: z.string().uuid('Choose a category'),
  amount: z.coerce.number().positive('Budget must be greater than 0'),
  notes: z.string().max(300).optional().or(z.literal('')),
})

export default function BudgetForm({ initial, year, month, existingCategoryIds = [], onDone }) {
  const toast = useToast()
  const { upsert } = useBudgetMutations()
  const { data: categories = [] } = useCategories('expense')
  const editing = Boolean(initial?.id)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      category_id: initial?.category_id ?? '',
      amount: initial?.amount ?? '',
      notes: initial?.notes ?? '',
    },
  })

  const available = categories.filter(
    (c) => c.id === initial?.category_id || !existingCategoryIds.includes(c.id),
  )

  const onSubmit = async (values) => {
    try {
      await upsert.mutateAsync({
        id: initial?.id,
        category_id: values.category_id,
        amount: values.amount,
        notes: values.notes || null,
        month,
        year,
      })
      toast.success(editing ? 'Budget updated.' : 'Budget created.')
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to save this budget.'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Category" error={errors.category_id?.message}>
        <Select {...register('category_id')} disabled={editing}>
          <option value="">Select category</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Monthly budget (₹)" error={errors.amount?.message}>
        <MoneyInput {...register('amount')} autoFocus />
      </Field>
      <Field label="Notes">
        <Textarea {...register('notes')} />
      </Field>
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create budget'}
        </button>
      </div>
    </form>
  )
}
