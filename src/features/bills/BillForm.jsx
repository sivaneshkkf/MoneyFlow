import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { format } from 'date-fns'
import { Field, TextInput, Textarea, Select, MoneyInput } from '../../components/common/form'
import { useCategories } from '../categories/useCategories'
import { useAccounts } from '../accounts/useAccounts'
import { usePaymentMethods } from '../settings/usePaymentMethods'
import { renderAccountOption } from '../accounts/accountOption'
import { renderCategoryOption } from '../categories/categoryOption'
import { accountOptionLabel, isCredit } from '../accounts/accountTheme'
import { useBillMutations } from './useBills'
import { useAccountMutations } from '../accounts/useAccounts'
import { formatCurrency } from '../../utils/format'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { FREQUENCIES, REMINDER_OPTIONS, WEEKDAYS, MONTHS, kindMeta } from './billMeta'

const KIND_OPTIONS = [
  { key: 'bill', label: 'Bill' },
  { key: 'emi', label: 'EMI / Loan' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'recurring', label: 'Recurring Payment' },
]

const num = (v) => (v === '' || v == null ? null : Number(v))

export default function BillForm({ initial, onDone }) {
  const editing = Boolean(initial?.id)
  const toast = useToast()
  const { create, update } = useBillMutations()
  const { update: updateAccount } = useAccountMutations()
  const { data: categories } = useCategories('expense')
  const { data: accounts } = useAccounts()
  const { data: methods } = usePaymentMethods()
  // Once any installment has actually moved money (charged to a card /
  // debited from cash), switching the source account would silently orphan
  // that history — lock it, same as original_principal/installments_total.
  const sourceLocked = editing && Number(initial?.liability?.installments_paid ?? 0) > 0

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      kind: initial?.kind ?? 'bill',
      name: initial?.name ?? initial?.description ?? '',
      amount: initial?.amount ?? '',
      category_id: initial?.category_id ?? '',
      account_id: initial?.account_id ?? '',
      payment_method_id: initial?.payment_method_id ?? '',
      frequency: initial?.frequency ?? 'monthly',
      due_day: initial?.due_day ?? new Date().getDate(),
      due_weekday: initial?.due_weekday ?? 1,
      due_month: initial?.due_month ?? 1,
      start_date: initial?.start_date ?? format(new Date(), 'yyyy-MM-dd'),
      end_date: initial?.end_date ?? '',
      // UI-only — never sent as its own field. Defaults to ongoing (checked)
      // unless editing something that already has a real end date set.
      no_end_date: !initial?.end_date,
      reminder_days_before: initial?.reminder_days_before ?? 3,
      autopay: initial?.autopay ?? false,
      notes: initial?.notes ?? '',
      merchant_name: initial?.merchant_name ?? '',
      // EMI
      lender_name: initial?.liability?.lender_name ?? '',
      original_principal: initial?.liability?.original_principal ?? '',
      interest_rate: initial?.liability?.interest_rate ?? '',
      installments_total: initial?.liability?.installments_total ?? '',
      already_paid: 0,
      emi_principal: initial?.emi_principal ?? '',
      emi_interest: initial?.emi_interest ?? '',
    },
  })

  const kind = watch('kind')
  const frequency = watch('frequency')
  const isEmi = kind === 'emi'
  const installmentsTotal = Number(watch('installments_total')) || 0
  const noEndDate = watch('no_end_date')

  // Two account roles for a Credit Card EMI (see 043): the loan/EMI source
  // (this form's account_id — charging it increases the card's own
  // outstanding, per _record_liability_payment) vs. the EMI Payment
  // Account, which isn't really per-EMI at all — a card only has one real
  // bank account its bill actually gets paid from — so this reuses the
  // card's own metadata.default_payment_account_id (already wired into the
  // Pay Bill flow in PayCreditCardBillForm.jsx) rather than inventing a
  // second, competing per-EMI field.
  const sourceAccountId = watch('account_id')
  const sourceAccount = (accounts ?? []).find((a) => a.id === sourceAccountId)
  const sourceIsCredit = Boolean(sourceAccount) && isCredit(sourceAccount)
  const paymentAccounts = (accounts ?? []).filter((a) => a.id !== sourceAccountId && !isCredit(a))
  const [cardPaymentAccountId, setCardPaymentAccountId] = useState('')

  useEffect(() => {
    setCardPaymentAccountId(sourceIsCredit ? sourceAccount?.metadata?.default_payment_account_id ?? '' : '')
  }, [sourceAccountId, sourceIsCredit, sourceAccount?.metadata?.default_payment_account_id])

  const saveCardPaymentAccount = async (value) => {
    setCardPaymentAccountId(value)
    try {
      await updateAccount.mutateAsync({
        id: sourceAccount.id,
        metadata: { ...(sourceAccount.metadata ?? {}), default_payment_account_id: value || undefined },
      })
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't save the card's payment account."))
    }
  }

  const onSubmit = async (v) => {
    if (!v.name.trim()) return
    // kind + frequency selects are disabled while editing, so RHF omits them.
    const effKind = editing ? initial.kind : v.kind
    const effFreq = editing ? initial.frequency : v.frequency
    const payload = {
      kind: effKind,
      name: v.name.trim(),
      description: v.name.trim(),
      amount: Number(v.amount),
      category_id: v.category_id || null,
      account_id: v.account_id || null,
      payment_method_id: v.payment_method_id || null,
      frequency: effFreq,
      due_day: ['monthly', 'quarterly', 'yearly'].includes(effFreq) ? num(v.due_day) : null,
      due_weekday: ['weekly', 'biweekly'].includes(effFreq) ? num(v.due_weekday) : null,
      due_month: effFreq === 'yearly' ? num(v.due_month) : null,
      start_date: v.start_date,
      end_date: v.no_end_date ? null : v.end_date || null,
      reminder_days_before: Number(v.reminder_days_before),
      autopay: Boolean(v.autopay),
      notes: v.notes.trim() || null,
      merchant_name: v.merchant_name.trim() || null,
      emi_principal: isEmi ? num(v.emi_principal) : null,
      emi_interest: isEmi ? num(v.emi_interest) : null,
    }
    if (effKind === 'emi') {
      payload.emi = {
        lender_name: v.lender_name.trim() || null,
        original_principal: Number(v.original_principal || 0),
        interest_rate: Number(v.interest_rate || 0),
        installments_total: Number(v.installments_total || 0),
        // Only meaningful on create — see the "Already paid" field below.
        already_paid: editing ? 0 : Math.min(Number(v.already_paid || 0), Number(v.installments_total || 0)),
      }
    }
    try {
      if (editing) await update.mutateAsync({ id: initial.id, ...payload })
      else await create.mutateAsync(payload)
      toast.success(editing ? 'Payment updated.' : 'Payment created.')
      onDone()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Payment type">
        <Select {...register('kind')} disabled={editing}>
          {KIND_OPTIONS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Name">
        <TextInput {...register('name')} autoFocus placeholder={isEmi ? 'Home Loan' : 'Electricity Bill'} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isEmi ? 'EMI amount' : 'Amount'}>
          <MoneyInput {...register('amount')} placeholder="0.00" />
        </Field>
        <Field label="Merchant / biller (optional)">
          <TextInput {...register('merchant_name')} placeholder="e.g. Netflix" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isEmi ? 'Interest expense category' : 'Category'}>
          <Select renderOption={renderCategoryOption(categories ?? [])} {...register('category_id')}>
            <option value="">Select category</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={isEmi ? 'Loan / EMI source account' : 'Payment account'}
          hint={
            sourceLocked
              ? "Locked — installments have already been charged/paid, so the source can't change now."
              : isEmi
                ? 'Where this loan/EMI debt originates. A credit card here means installments are charged to that card, not debited as cash.'
                : undefined
          }
        >
          <Select
            {...register('account_id')}
            renderOption={renderAccountOption(accounts ?? [])}
            disabled={sourceLocked}
          >
            <option value="">Select account</option>
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {accountOptionLabel(a)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {isEmi && sourceIsCredit && (
        <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs text-ink">
            <span className="font-semibold">Credit Card EMI:</span> each installment you mark paid adds to{' '}
            {accountOptionLabel(sourceAccount)}&apos;s outstanding balance — it doesn&apos;t touch any cash account
            directly. You pay it off separately, whenever you pay that card's bill (Bills &amp; Recurring → Credit
            Card Bills).
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-ink-soft">Current outstanding</p>
              <p className="text-sm font-bold">{formatCurrency(Number(sourceAccount.metadata?.current_outstanding ?? 0))}</p>
            </div>
            {Number(sourceAccount.metadata?.credit_limit ?? 0) > 0 && (
              <>
                <div>
                  <p className="text-[11px] text-ink-soft">Credit limit</p>
                  <p className="text-sm font-bold">{formatCurrency(Number(sourceAccount.metadata.credit_limit))}</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-soft">Available credit</p>
                  <p className="text-sm font-bold">
                    {formatCurrency(
                      Math.max(0, Number(sourceAccount.metadata.credit_limit) - Number(sourceAccount.metadata?.current_outstanding ?? 0)),
                    )}
                  </p>
                </div>
              </>
            )}
          </div>
          <Field
            label="EMI payment account"
            hint={`Saved as ${accountOptionLabel(sourceAccount)}'s default account for paying its bill — shared across everything charged to this card, not just this EMI.`}
          >
            <Select
              value={cardPaymentAccountId}
              onChange={(e) => saveCardPaymentAccount(e.target.value)}
              renderOption={renderAccountOption(paymentAccounts)}
              disabled={updateAccount.isPending}
            >
              <option value="">None set</option>
              {paymentAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountOptionLabel(a)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Frequency">
          <Select {...register('frequency')} disabled={editing}>
            {FREQUENCIES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>

        {['monthly', 'quarterly'].includes(frequency) && (
          <Field label="Due day of month">
            <TextInput type="number" min="1" max="31" {...register('due_day')} />
          </Field>
        )}
        {['weekly', 'biweekly'].includes(frequency) && (
          <Field label="Due weekday">
            <Select {...register('due_weekday')}>
              {WEEKDAYS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {frequency === 'yearly' && (
          <Field label="Due month">
            <Select {...register('due_month')}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date">
          <TextInput type="date" {...register('start_date')} />
        </Field>
        <Field label="End date">
          <TextInput type="date" {...register('end_date')} disabled={noEndDate} />
          <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
            <input type="checkbox" className="h-3.5 w-3.5" {...register('no_end_date')} />
            No end date (ongoing) — keeps generating payments until you pause, cancel, or set an end date
          </label>
        </Field>
      </div>

      {isEmi && (
        <div className="space-y-4 rounded-xl border border-line p-3 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Loan details</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lender">
              <TextInput {...register('lender_name')} placeholder="e.g. HDFC Bank" />
            </Field>
            <Field label="Original principal">
              <MoneyInput {...register('original_principal')} disabled={editing} />
            </Field>
            <Field label="Interest rate (annual %)" hint="Used to build the amortization schedule.">
              <TextInput type="number" step="0.001" min="0" {...register('interest_rate')} />
            </Field>
            <Field label="Total installments">
              <TextInput type="number" min="0" {...register('installments_total')} disabled={editing} />
            </Field>
            {!editing && (
              <Field
                label="Already paid (optional)"
                hint="Installments paid outside the app, before adding this loan here. They'll show as Paid in the schedule and won't touch your account balance or create transactions."
              >
                <TextInput
                  type="number"
                  min="0"
                  max={installmentsTotal || undefined}
                  {...register('already_paid')}
                />
              </Field>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fixed principal / EMI (optional)" hint="Leave blank to use the rate above.">
              <MoneyInput {...register('emi_principal')} />
            </Field>
            <Field label="Fixed interest / EMI (optional)">
              <MoneyInput {...register('emi_interest')} />
            </Field>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Remind me (days before)">
          <Select {...register('reminder_days_before')}>
            {REMINDER_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'On the due date' : `${n} day${n === 1 ? '' : 's'} before`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment method (optional)">
          <Select {...register('payment_method_id')}>
            <option value="">None</option>
            {(methods ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <label className="flex items-start justify-between gap-3 rounded-xl border border-line p-3 text-sm dark:border-white/10">
        <span>
          <span className="font-medium">Autopay</span>
          <span className="block text-xs text-ink-soft">
            Automatically create the payment transaction when it becomes due (needs a linked account with enough balance).
          </span>
        </span>
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" {...register('autopay')} />
      </label>

      <Field label="Notes (optional)">
        <Textarea {...register('notes')} rows={2} />
      </Field>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {editing ? 'Save' : `Create ${kindMeta(kind).label.toLowerCase()}`}
        </button>
      </div>
    </form>
  )
}
