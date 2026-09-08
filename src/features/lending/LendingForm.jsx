import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Search, User } from 'lucide-react'
import { Field, TextInput, Textarea, Select, MoneyInput } from '../../components/common/form'
import { useAccounts } from '../accounts/useAccounts'
import { accountOptionLabel } from '../accounts/accountTheme'
import { renderAccountOption } from '../accounts/accountOption'
import { useLendingMutations, useBorrowerDirectory } from './useLending'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { formatCurrency } from '../../utils/format'
import { INTEREST_TYPES } from '../../constants'
import { SCHEDULE_FREQUENCIES } from './schedule'

const schema = z
  .object({
    borrower_name: z.string().min(1, 'Borrower name is required'),
    phone: z.string().optional().or(z.literal('')),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    address: z.string().optional().or(z.literal('')),
    principal_amount: z.coerce.number().positive('Amount lent must be greater than 0'),
    lending_date: z.string().min(1, 'Lending date is required'),
    schedule_type: z.enum(['one_time', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
    due_date: z.string().optional().or(z.literal('')),
    first_due_date: z.string().optional().or(z.literal('')),
    installments: z.coerce.number().int().min(1).max(600).optional(),
    already_paid: z.coerce.number().int().min(0).optional(),
    interest_type: z.enum(['none', 'fixed', 'percentage', 'simple']),
    interest_rate: z.coerce.number().min(0, 'Rate cannot be negative').optional(),
    interest_amount: z.coerce.number().min(0, 'Interest cannot be negative').optional(),
    account_id: z.string().optional().or(z.literal('')),
    purpose: z.string().optional().or(z.literal('')),
    notes: z.string().optional().or(z.literal('')),
  })
  .refine((d) => d.schedule_type !== 'one_time' || !d.due_date || d.due_date >= d.lending_date, {
    path: ['due_date'],
    message: 'Due date cannot be before the lending date',
  })
  .refine((d) => d.schedule_type === 'one_time' || (d.first_due_date && d.first_due_date >= d.lending_date), {
    path: ['first_due_date'],
    message: 'First due date must be on or after the lending date',
  })
  .refine((d) => d.schedule_type === 'one_time' || (d.installments && d.installments >= 1), {
    path: ['installments'],
    message: 'Enter the number of installments',
  })
  .refine((d) => !d.already_paid || !d.installments || d.already_paid <= d.installments, {
    path: ['already_paid'],
    message: 'Cannot exceed the number of installments',
  })

function interestTotalOf(v) {
  const principal = Number(v.principal_amount) || 0
  if (v.interest_type === 'fixed') return Number(v.interest_amount) || 0
  if (v.interest_type === 'percentage' || v.interest_type === 'simple')
    return Math.round(((principal * (Number(v.interest_rate) || 0)) / 100) * 100) / 100
  return 0
}

export default function LendingForm({ initial, onDone }) {
  const toast = useToast()
  const { create, update, generateSchedule, markInstallmentsAlreadyPaid } = useLendingMutations()
  const { data: accounts = [] } = useAccounts()
  const { data: borrowers = [] } = useBorrowerDirectory()
  const editing = Boolean(initial?.id)
  const lockedSchedule = editing && initial?.schedule_generated

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      borrower_name: initial?.borrower_name ?? '',
      phone: initial?.phone ?? '',
      email: initial?.email ?? '',
      address: initial?.address ?? '',
      principal_amount: initial?.principal_amount ?? '',
      lending_date: initial?.lending_date ?? format(new Date(), 'yyyy-MM-dd'),
      schedule_type: initial?.installment_frequency ?? 'one_time',
      due_date: initial?.due_date ?? '',
      first_due_date: '',
      installments: 6,
      already_paid: 0,
      interest_type: initial?.interest_type ?? 'none',
      interest_rate: initial?.interest_rate ?? 0,
      interest_amount: initial?.interest_amount ?? 0,
      account_id: initial?.account_id ?? '',
      purpose: initial?.purpose ?? '',
      notes: initial?.notes ?? '',
    },
  })

  // Search-as-you-type borrower autofill — only in create mode, since editing
  // an existing record already has its own contact details loaded.
  const [borrowerOpen, setBorrowerOpen] = useState(false)
  const borrowerWrapRef = useRef(null)
  const borrowerNameField = register('borrower_name')
  const borrowerQuery = (watch('borrower_name') || '').trim().toLowerCase()
  const borrowerMatches = !editing
    ? borrowers.filter((b) => b.borrower_name.toLowerCase().includes(borrowerQuery)).slice(0, 8)
    : []

  useEffect(() => {
    if (!borrowerOpen) return
    const onDocMouseDown = (e) => {
      if (!borrowerWrapRef.current?.contains(e.target)) setBorrowerOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [borrowerOpen])

  const selectBorrower = (b) => {
    setValue('borrower_name', b.borrower_name, { shouldValidate: true })
    setValue('phone', b.phone || '')
    setValue('email', b.email || '')
    setValue('address', b.address || '')
    setBorrowerOpen(false)
  }

  const interestType = watch('interest_type')
  const scheduleType = watch('schedule_type')
  const scheduled = scheduleType !== 'one_time'
  const principal = Number(watch('principal_amount')) || 0
  const count = Number(watch('installments')) || 0
  const perInstallment = scheduled && count > 0 ? (principal + interestTotalOf(watch())) / count : 0

  const onSubmit = async (values) => {
    const interestTotal = interestTotalOf(values)
    const payload = {
      borrower_name: values.borrower_name,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      principal_amount: values.principal_amount,
      lending_date: values.lending_date,
      account_id: values.account_id || null,
      purpose: values.purpose || null,
      notes: values.notes || null,
      interest_type: scheduled ? (interestTotal > 0 ? 'fixed' : 'none') : values.interest_type,
      interest_rate: !scheduled && (values.interest_type === 'percentage' || values.interest_type === 'simple') ? values.interest_rate : 0,
      interest_amount: scheduled ? interestTotal : values.interest_type === 'fixed' ? values.interest_amount : 0,
      due_date: scheduled ? null : values.due_date || null,
    }

    try {
      if (editing) {
        // Amount / source account / schedule are locked after creation.
        const { account_id, principal_amount, ...safe } = payload
        void account_id
        void principal_amount
        if (lockedSchedule) {
          delete safe.due_date
          delete safe.interest_type
          delete safe.interest_amount
        }
        await update.mutateAsync({ id: initial.id, ...safe })
        // Editing a one-time loan into a scheduled one: build the schedule now.
        if (!initial.schedule_generated && scheduled) {
          await generateSchedule.mutateAsync({
            recordId: initial.id,
            frequency: values.schedule_type,
            firstDueDate: values.first_due_date,
            count: Number(values.installments),
            interestTotal,
          })
          if (Number(values.already_paid) > 0) {
            await markInstallmentsAlreadyPaid.mutateAsync({
              recordId: initial.id,
              count: Number(values.already_paid),
            })
          }
        }
        toast.success('Lending record updated.')
      } else {
        const rec = await create.mutateAsync(payload)
        if (scheduled) {
          await generateSchedule.mutateAsync({
            recordId: rec.id,
            frequency: values.schedule_type,
            firstDueDate: values.first_due_date,
            count: Number(values.installments),
            interestTotal,
          })
          if (Number(values.already_paid) > 0) {
            await markInstallmentsAlreadyPaid.mutateAsync({
              recordId: rec.id,
              count: Number(values.already_paid),
            })
          }
        }
        toast.success('Lending record created.')
      }
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to save this lending record.'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Borrower name" error={errors.borrower_name?.message}>
          <div className="relative" ref={borrowerWrapRef}>
            {!editing && (
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            )}
            <input
              {...borrowerNameField}
              onChange={(e) => {
                borrowerNameField.onChange(e)
                if (!editing) setBorrowerOpen(true)
              }}
              onFocus={() => !editing && setBorrowerOpen(true)}
              autoComplete="off"
              autoFocus
              className={editing ? 'input' : 'input pl-9'}
            />
            {!editing && borrowerOpen && borrowerMatches.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#1B2523]">
                {borrowerMatches.map((b) => (
                  <li key={b.borrower_name}>
                    <button
                      type="button"
                      onClick={() => selectBorrower(b)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-white/5"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-900 dark:bg-white/10 dark:text-white">
                        <User className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{b.borrower_name}</span>
                        {(b.phone || b.email) && (
                          <span className="block truncate text-xs text-ink-soft">{b.phone || b.email}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <TextInput {...register('phone')} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email" error={errors.email?.message}>
          <TextInput type="email" {...register('email')} />
        </Field>
        <Field label="Address" error={errors.address?.message}>
          <TextInput {...register('address')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Amount lent (₹)" error={errors.principal_amount?.message} hint={editing ? 'Locked after creation' : undefined}>
          <MoneyInput disabled={editing} {...register('principal_amount')} />
        </Field>
        <Field label="Lend from account" error={errors.account_id?.message} hint={editing ? 'Locked after creation' : 'Cash leaves this account'}>
          <Select renderOption={renderAccountOption(accounts)} disabled={editing} {...register('account_id')}>
            <option value="">No account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountOptionLabel(a)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Lending date" error={errors.lending_date?.message}>
          <TextInput type="date" {...register('lending_date')} />
        </Field>
        <Field label="Repayment plan" hint={lockedSchedule ? 'Regenerate from the loan page' : undefined}>
          <Select {...register('schedule_type')} disabled={lockedSchedule}>
            {SCHEDULE_FREQUENCIES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!scheduled && (
        <Field label="Due date" error={errors.due_date?.message}>
          <TextInput type="date" {...register('due_date')} />
        </Field>
      )}

      {scheduled && !lockedSchedule && (
        <div className="rounded-xl border border-line p-3 dark:border-white/10">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First installment due" error={errors.first_due_date?.message}>
              <TextInput type="date" {...register('first_due_date')} />
            </Field>
            <Field label="Number of installments" error={errors.installments?.message}>
              <TextInput type="number" min="1" max="600" step="1" {...register('installments')} />
            </Field>
          </div>
          {perInstallment > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              ≈ {formatCurrency(perInstallment)} per installment · {count} payments
            </p>
          )}
          <Field
            label="Already paid (optional)"
            error={errors.already_paid?.message}
            hint="Installments the borrower already repaid before adding this loan here. They'll show as Paid and won't affect your account balance or create a transaction."
          >
            <TextInput type="number" min="0" max={count || undefined} step="1" {...register('already_paid')} />
          </Field>
        </div>
      )}

      <div className={scheduled ? '' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
        <Field label="Interest type" error={errors.interest_type?.message}>
          <Select {...register('interest_type')} disabled={lockedSchedule}>
            {Object.entries(INTEREST_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {!scheduled && <div />}
      </div>

      {(interestType === 'percentage' || interestType === 'simple') && (
        <Field label="Interest rate (% of principal)" error={errors.interest_rate?.message}>
          <TextInput type="number" step="0.01" min="0" {...register('interest_rate')} disabled={lockedSchedule} />
        </Field>
      )}
      {interestType === 'fixed' && (
        <Field label="Total interest amount (₹)" error={errors.interest_amount?.message}>
          <MoneyInput {...register('interest_amount')} disabled={lockedSchedule} />
        </Field>
      )}
      {scheduled && (
        <p className="text-xs text-ink-soft">
          Interest is split evenly across all installments. Principal + interest per installment sum
          exactly to the loan total (last installment absorbs any rounding).
        </p>
      )}

      <Field label="Purpose" error={errors.purpose?.message}>
        <TextInput placeholder="e.g. Medical emergency" {...register('purpose')} />
      </Field>
      <Field label="Notes">
        <Textarea {...register('notes')} />
      </Field>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create record'}
        </button>
      </div>
    </form>
  )
}
