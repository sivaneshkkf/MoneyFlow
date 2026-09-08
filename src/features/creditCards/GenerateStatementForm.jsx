import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, startOfMonth, endOfMonth, subMonths, addDays } from 'date-fns'
import { Field, TextInput } from '../../components/common/form'
import { accountOptionLabel } from '../accounts/accountTheme'
import { useCreditCardMutations } from './useCreditCards'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const schema = z
  .object({
    period_start: z.string().min(1, 'Pick a start date'),
    period_end: z.string().min(1, 'Pick an end date'),
    due_date: z.string().min(1, 'Pick a due date'),
  })
  .refine((d) => d.period_end > d.period_start, {
    path: ['period_end'],
    message: 'Must be after the start date',
  })
  .refine((d) => d.due_date >= d.period_end, {
    path: ['due_date'],
    message: 'Cannot be before the period ends',
  })

/**
 * Manual fallback alongside automatic generation (see the daily-cron-driven
 * generate_due_credit_card_statements_all() in 042) — same underlying
 * insert logic either way, so this can never diverge from what the
 * scheduler produces. Same idempotency the RPC enforces: generating the
 * same card + period twice just returns the existing statement, never a
 * duplicate — this form doesn't need to guard against it itself.
 *
 * period_end is INCLUSIVE (a "26 Aug – 25 Sep" statement counts the 25 Sep
 * purchase) — defaults to last full calendar month accordingly.
 */
export default function GenerateStatementForm({ card, onDone }) {
  const toast = useToast()
  const { generateStatement } = useCreditCardMutations()

  const lastMonthStart = startOfMonth(subMonths(new Date(), 1))
  const lastMonthEnd = endOfMonth(subMonths(new Date(), 1))

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      period_start: format(lastMonthStart, 'yyyy-MM-dd'),
      period_end: format(lastMonthEnd, 'yyyy-MM-dd'),
      due_date: format(addDays(lastMonthEnd, 15), 'yyyy-MM-dd'),
    },
  })

  const onSubmit = async (v) => {
    try {
      await generateStatement.mutateAsync({
        accountId: card.id,
        periodStart: v.period_start,
        periodEnd: v.period_end,
        dueDate: v.due_date,
      })
      toast.success('Statement generated.')
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-sm text-ink-soft">
        Totals every real transaction on <span className="font-semibold text-ink">{accountOptionLabel(card)}</span> within
        this period into one statement. It never creates a new expense — the purchases were already recorded.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Period start" error={errors.period_start?.message}>
          <TextInput type="date" {...register('period_start')} />
        </Field>
        <Field label="Period end" error={errors.period_end?.message}>
          <TextInput type="date" {...register('period_end')} />
        </Field>
      </div>
      <Field label="Payment due date" error={errors.due_date?.message}>
        <TextInput type="date" {...register('due_date')} />
      </Field>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Generating…' : 'Generate statement'}
        </button>
      </div>
    </form>
  )
}
