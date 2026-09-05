import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Field, TextInput, Textarea, Select, MoneyInput } from '../../components/common/form'
import { useGoalMutations } from './useGoals'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const CATEGORIES = ['Emergency Fund', 'New Laptop', 'Bike', 'Car', 'Vacation', 'Education', 'House', 'Other']

const schema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    target_amount: z.coerce.number().positive('Target must be greater than 0'),
    current_amount: z.coerce.number().min(0).optional(),
    target_date: z.string().optional().or(z.literal('')),
    category: z.string().optional().or(z.literal('')),
    description: z.string().max(300).optional().or(z.literal('')),
  })

export default function GoalForm({ initial, onDone }) {
  const toast = useToast()
  const { create, update } = useGoalMutations()
  const editing = Boolean(initial?.id)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      target_amount: initial?.target_amount ?? '',
      current_amount: initial?.current_amount ?? 0,
      target_date: initial?.target_date ?? '',
      category: initial?.category ?? 'Other',
      description: initial?.description ?? '',
    },
  })

  const onSubmit = async (values) => {
    const payload = {
      name: values.name,
      target_amount: values.target_amount,
      target_date: values.target_date || null,
      category: values.category || null,
      description: values.description || null,
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: initial.id, ...payload })
      } else {
        await create.mutateAsync({ ...payload, current_amount: values.current_amount || 0 })
      }
      toast.success(editing ? 'Goal updated.' : 'Goal created.')
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to save this goal.'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Goal name" error={errors.name?.message}>
        <TextInput placeholder="e.g. Emergency Fund" {...register('name')} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target amount (₹)" error={errors.target_amount?.message}>
          <MoneyInput {...register('target_amount')} />
        </Field>
        <Field label="Target date">
          <TextInput type="date" {...register('target_date')} />
        </Field>
      </div>
      {!editing && (
        <Field label="Already saved (₹)" hint="Optional starting balance">
          <MoneyInput {...register('current_amount')} />
        </Field>
      )}
      <Field label="Category">
        <Select {...register('category')}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Description">
        <Textarea {...register('description')} />
      </Field>
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create goal'}
        </button>
      </div>
    </form>
  )
}
