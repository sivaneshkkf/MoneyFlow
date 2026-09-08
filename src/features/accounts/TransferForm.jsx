import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import { Field, TextInput, Textarea, Select, MoneyInput } from '../../components/common/form'
import { useAccounts, useAccountMutations } from './useAccounts'
import { renderAccountOption } from './accountOption'
import { accountOptionLabel, isCredit } from './accountTheme'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { formatCurrency } from '../../utils/format'

const schema = z
  .object({
    from_account_id: z.string().uuid('Choose a source account'),
    to_account_id: z.string().uuid('Choose a destination account'),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    transfer_date: z.string().min(1, 'Pick a date'),
    notes: z.string().max(300).optional().or(z.literal('')),
  })
  .refine((d) => d.from_account_id !== d.to_account_id, {
    path: ['to_account_id'],
    message: 'Choose a different account than the source',
  })

/**
 * Moves money between two of the user's own accounts. Credit cards are
 * excluded from both pickers — their balance tracks debt (metadata.
 * current_outstanding), not cash, so a transfer in or out of one would move
 * a number nobody looks at. See transfer_between_accounts() for the
 * matching server-side guard (never trust the client-side filter alone).
 */
export default function TransferForm({ onDone }) {
  const toast = useToast()
  const { transfer } = useAccountMutations()
  const { data: accounts = [] } = useAccounts()
  const cashAccounts = accounts.filter((a) => !isCredit(a))
  const tokenRef = useRef(crypto.randomUUID())

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      from_account_id: '',
      to_account_id: '',
      amount: '',
      transfer_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    },
  })

  const fromId = watch('from_account_id')
  const fromAccount = cashAccounts.find((a) => a.id === fromId)

  const onSubmit = async (v) => {
    try {
      await transfer.mutateAsync({
        fromAccountId: v.from_account_id,
        toAccountId: v.to_account_id,
        amount: Number(v.amount),
        date: v.transfer_date,
        notes: v.notes.trim() || null,
        clientToken: tokenRef.current,
      })
      toast.success('Transfer complete.')
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  if (cashAccounts.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-ink-soft">
        You need at least two non-credit-card accounts to transfer between them.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <Field label="From account" error={errors.from_account_id?.message}>
          <Select renderOption={renderAccountOption(cashAccounts)} {...register('from_account_id')}>
            <option value="">Select account</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountOptionLabel(a)}
              </option>
            ))}
          </Select>
        </Field>
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-ink-soft sm:mb-2.5 sm:block" />
        <Field label="To account" error={errors.to_account_id?.message}>
          <Select renderOption={renderAccountOption(cashAccounts)} {...register('to_account_id')}>
            <option value="">Select account</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountOptionLabel(a)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Amount (₹)"
        error={errors.amount?.message}
        hint={fromAccount ? `${accountOptionLabel(fromAccount)} balance: ${formatCurrency(fromAccount.current_balance)}` : undefined}
      >
        <MoneyInput {...register('amount')} placeholder="0.00" />
      </Field>

      <Field label="Date" error={errors.transfer_date?.message}>
        <TextInput type="date" {...register('transfer_date')} />
      </Field>

      <Field label="Notes (optional)">
        <Textarea {...register('notes')} rows={2} placeholder="e.g. Moving savings to fixed deposit" />
      </Field>

      <p className="text-xs text-ink-soft">
        This moves cash between your own accounts — it won&apos;t appear as income or an expense anywhere.
      </p>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Transferring…' : 'Transfer'}
        </button>
      </div>
    </form>
  )
}
