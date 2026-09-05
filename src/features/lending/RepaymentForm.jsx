import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Field, TextInput, Select, Textarea, MoneyInput } from '../../components/common/form'
import { useAccounts } from '../accounts/useAccounts'
import { accountOptionLabel } from '../accounts/accountTheme'
import { renderAccountOption } from '../accounts/accountOption'
import { usePaymentMethods } from '../settings/usePaymentMethods'
import { useLendingMutations } from './useLending'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { formatCurrency, formatDate } from '../../utils/format'
import { loanScheduleSummary, previewAllocation } from './schedule'

export default function RepaymentForm({ record, onDone, prefill }) {
  const toast = useToast()
  const { recordRepayment } = useLendingMutations()
  const clientToken = useRef(crypto.randomUUID())
  const { data: accounts = [] } = useAccounts()
  const { data: methods = [] } = usePaymentMethods()

  const outP = Number(record.outstanding_principal)
  const outI = Number(record.outstanding_interest)
  const sched = loanScheduleSummary(record, record.installments)

  const schema = z
    .object({
      principal: z.coerce.number().min(0, 'Cannot be negative'),
      interest: z.coerce.number().min(0, 'Cannot be negative'),
      payment_date: z.string().min(1, 'Pick a date'),
      account_id: z.string().optional().or(z.literal('')),
      payment_method_id: z.string().optional().or(z.literal('')),
      notes: z.string().max(300).optional().or(z.literal('')),
    })
    .refine((d) => d.principal + d.interest > 0, { path: ['principal'], message: 'Enter an amount' })
    .refine((d) => d.principal <= outP + 0.001, {
      path: ['principal'],
      message: `Max principal is ${formatCurrency(outP)}`,
    })
    .refine((d) => d.interest <= outI + 0.001, {
      path: ['interest'],
      message: `Max interest is ${formatCurrency(outI)}`,
    })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      principal: prefill?.principal ?? '',
      interest: prefill?.interest ?? '',
      payment_date: prefill?.dueDate ?? format(new Date(), 'yyyy-MM-dd'),
      account_id: '',
      payment_method_id: '',
      notes: '',
    },
  })

  const principal = Number(watch('principal') || 0)
  const interest = Number(watch('interest') || 0)
  const total = principal + interest
  const allocationPreview =
    sched.scheduled && total > 0 ? previewAllocation(record.installments, principal, interest) : []

  const onSubmit = async (values) => {
    try {
      await recordRepayment.mutateAsync({
        recordId: record.id,
        amount: values.principal + values.interest,
        principal: values.principal,
        interest: values.interest,
        date: values.payment_date,
        accountId: values.account_id,
        paymentMethodId: values.payment_method_id,
        notes: values.notes,
        clientToken: clientToken.current,
      })
      toast.success('Repayment recorded.')
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to record this repayment.'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-white/5">
        <div className="flex justify-between">
          <span className="text-ink-soft">Total outstanding</span>
          <span className="font-semibold">{formatCurrency(outP + outI)}</span>
        </div>
        {sched.scheduled && (
          <>
            <div className="mt-1 flex justify-between">
              <span className="text-ink-soft">Overdue</span>
              <span className={`font-semibold ${sched.overdueAmount > 0 ? 'text-danger' : ''}`}>
                {formatCurrency(sched.overdueAmount)}
              </span>
            </div>
            {sched.nextDueDate && (
              <div className="mt-1 flex justify-between">
                <span className="text-ink-soft">Next installment</span>
                <span className="font-semibold">
                  {formatCurrency(sched.nextDueAmount)} · {formatDate(sched.nextDueDate)}
                </span>
              </div>
            )}
          </>
        )}
        <div className="mt-1 flex justify-between text-xs text-ink-soft">
          <span>Principal {formatCurrency(outP)}</span>
          <span>Interest {formatCurrency(outI)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Principal (₹)" error={errors.principal?.message}>
          <MoneyInput {...register('principal')} autoFocus />
        </Field>
        <Field label="Interest (₹)" error={errors.interest?.message}>
          <MoneyInput {...register('interest')} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost !py-1 text-xs"
          onClick={() => {
            setValue('principal', outP)
            setValue('interest', outI)
          }}
        >
          Pay full outstanding
        </button>
        <span className="ml-auto self-center text-sm">
          Total received: <b>{formatCurrency(total)}</b>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.payment_date?.message}>
          <TextInput type="date" {...register('payment_date')} />
        </Field>
        <Field label="Into account" hint="Cash increases here">
          <Select renderOption={renderAccountOption(accounts)} {...register('account_id')}>
            <option value="">No account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountOptionLabel(a)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
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
      <Field label="Notes">
        <Textarea {...register('notes')} />
      </Field>

      {allocationPreview.length > 0 && (
        <div className="rounded-xl border border-line p-3 text-sm dark:border-white/10">
          <p className="mb-1.5 font-medium">This payment will be applied to:</p>
          <ul className="space-y-1">
            {allocationPreview.map((r) => (
              <li key={r.number} className="flex justify-between text-xs text-ink-soft">
                <span>
                  Installment #{r.number} · {formatDate(r.due_date, 'dd MMM yyyy')}
                </span>
                <span className="font-medium text-ink">
                  {formatCurrency(r.principal + r.interest)}
                  {r.interest > 0 ? ` (incl. ${formatCurrency(r.interest)} interest)` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-soft">
        Principal repayment reduces the receivable (not income). Interest is recorded as income.
      </p>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Recording…' : 'Record repayment'}
        </button>
      </div>
    </form>
  )
}
