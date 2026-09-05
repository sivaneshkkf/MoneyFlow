import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Field, Select, Textarea, MoneyInput } from '../../components/common/form'
import { useAccounts } from '../accounts/useAccounts'
import { accountOptionLabel } from '../accounts/accountTheme'
import { renderAccountOption } from '../accounts/accountOption'
import { useGoalMutations } from './useGoals'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { formatCurrency } from '../../utils/format'

const makeSchema = (max) =>
  z.object({
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    account_id: z.string().optional().or(z.literal('')),
    notes: z.string().max(200).optional().or(z.literal('')),
  }).refine((d) => max == null || d.amount <= max, {
    path: ['amount'],
    message: `Cannot withdraw more than ${formatCurrency(max ?? 0)}`,
  })

export default function ContributionForm({ goal, mode, onDone }) {
  const toast = useToast()
  const { contribute } = useGoalMutations()
  const { data: accounts = [] } = useAccounts()
  const isWithdraw = mode === 'withdraw'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(makeSchema(isWithdraw ? Number(goal.current_amount) : null)),
  })

  const onSubmit = async (values) => {
    try {
      await contribute.mutateAsync({
        goalId: goal.id,
        amount: isWithdraw ? -Math.abs(values.amount) : Math.abs(values.amount),
        account_id: values.account_id,
        notes: values.notes,
      })
      toast.success(isWithdraw ? 'Withdrawal recorded.' : 'Contribution added.')
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-sm text-ink-soft">
        {goal.name} — {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)} saved
      </p>
      <Field label={`Amount to ${isWithdraw ? 'withdraw' : 'add'} (₹)`} error={errors.amount?.message}>
        <MoneyInput {...register('amount')} autoFocus />
      </Field>
      <Field label="Account (optional)" hint="For your records — does not move account balance">
        <Select renderOption={renderAccountOption(accounts)} {...register('account_id')}>
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {accountOptionLabel(a)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes">
        <Textarea {...register('notes')} />
      </Field>
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : isWithdraw ? 'Withdraw' : 'Add money'}
        </button>
      </div>
    </form>
  )
}
