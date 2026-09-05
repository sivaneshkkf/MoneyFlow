import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Field, Select, TextInput, Textarea, MoneyInput } from '../../components/common/form'
import { ACCOUNT_TYPES } from '../../constants'
import { NETWORKS, BANK_SUBTYPES, CREDIT_PALETTES, DEBIT_PALETTES, typeKey, cardGradient } from './accountTheme'
import { useAccountMutations } from './useAccounts'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR + i)

const schema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    type: z.string().min(1),
    institution: z.string().optional().or(z.literal('')),
    subtype: z.string().optional().or(z.literal('')),
    ifsc: z.string().max(15).optional().or(z.literal('')),
    upi_id: z.string().max(60).optional().or(z.literal('')),
    identifier: z.string().max(60).optional().or(z.literal('')),
    network: z.string().optional().or(z.literal('')),
    expiry_month: z.string().optional().or(z.literal('')),
    expiry_year: z.string().optional().or(z.literal('')),
    theme: z.string().optional().or(z.literal('')),
    last_four_digits: z
      .string()
      .regex(/^\d{0,4}$/, 'Digits only, max 4')
      .optional()
      .or(z.literal('')),
    opening_balance: z.coerce.number().min(0, 'Cannot be negative').optional(),
    credit_limit: z.coerce.number().min(0, 'Cannot be negative').optional(),
    current_outstanding: z.coerce.number().min(0, 'Cannot be negative').optional(),
    currency: z.string().min(1),
    notes: z.string().max(400).optional().or(z.literal('')),
  })
  .refine((d) => typeKey(d.type) !== 'credit_card' || (d.current_outstanding ?? 0) <= (d.credit_limit ?? 0), {
    path: ['current_outstanding'],
    message: 'Outstanding cannot exceed the credit limit',
  })

export default function AccountForm({ initial, onDone }) {
  const toast = useToast()
  const { create, update } = useAccountMutations()
  const editing = Boolean(initial?.id)
  const md = initial?.metadata ?? {}

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      type: initial?.type ?? 'Bank Account',
      institution: initial?.institution ?? '',
      subtype: md.subtype ?? 'Savings',
      ifsc: md.ifsc ?? '',
      upi_id: md.upi_id ?? '',
      identifier: md.identifier ?? '',
      network: md.network ?? 'Visa',
      expiry_month: md.expiry_month ? String(md.expiry_month) : '',
      expiry_year: md.expiry_year ? String(md.expiry_year) : '',
      theme: md.theme ?? '',
      last_four_digits: initial?.last_four_digits ?? '',
      opening_balance: initial?.opening_balance ?? 0,
      credit_limit: md.credit_limit ?? '',
      current_outstanding: md.current_outstanding ?? '',
      currency: initial?.currency ?? 'INR',
      notes: md.notes ?? '',
    },
  })

  const type = watch('type')
  const key = typeKey(type)
  const isCredit = key === 'credit_card'
  const isDebit = key === 'debit_card'
  const isBank = key === 'bank'
  const isUpi = key === 'upi'
  const isDigital = key === 'digital_wallet'
  const isCash = key === 'cash'
  const palettes = isCredit ? CREDIT_PALETTES : DEBIT_PALETTES

  const onSubmit = async (v) => {
    // Start from existing metadata so unmanaged keys (e.g. bank_logo_url) survive.
    const metadata = { ...md }
    const put = (k, val) => {
      if (val === undefined || val === null || val === '') delete metadata[k]
      else metadata[k] = val
    }

    put('subtype', isBank ? v.subtype : undefined)
    put('ifsc', isBank && v.ifsc ? v.ifsc.toUpperCase() : undefined)
    put('upi_id', isUpi ? v.upi_id : undefined)
    put('identifier', isDigital ? v.identifier : undefined)
    put('network', isCredit || isDebit ? v.network : undefined)
    put('expiry_month', (isCredit || isDebit) && v.expiry_month ? Number(v.expiry_month) : undefined)
    put('expiry_year', (isCredit || isDebit) && v.expiry_year ? Number(v.expiry_year) : undefined)
    put('theme', isCredit || isDebit ? v.theme : undefined)
    put('credit_limit', isCredit ? Number(v.credit_limit) || 0 : undefined)
    put('current_outstanding', isCredit ? Number(v.current_outstanding) || 0 : undefined)
    put('notes', v.notes)

    const payload = {
      name: v.name,
      type: v.type,
      currency: v.currency,
      institution: v.institution || null,
      last_four_digits: v.last_four_digits || null,
      opening_balance: isCredit ? 0 : Number(v.opening_balance) || 0,
      metadata,
    }

    try {
      if (editing) {
        // opening_balance can't be safely re-based on an existing account.
        const { opening_balance, ...safe } = payload
        void opening_balance
        await update.mutateAsync({ id: initial.id, ...safe })
      } else {
        await create.mutateAsync(payload)
      }
      toast.success(editing ? 'Account updated.' : 'Account created.')
      onDone?.()
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to save this account.'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Account name" error={errors.name?.message}>
          <TextInput placeholder="e.g. HDFC Savings" {...register('name')} autoFocus />
        </Field>
        <Field label="Account type" error={errors.type?.message}>
          <Select {...register('type')} disabled={editing}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {(isBank || isCredit || isDebit || isUpi || isDigital) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={isUpi || isDigital ? 'Provider (optional)' : 'Bank name'} error={errors.institution?.message}>
            <TextInput placeholder={isUpi ? 'e.g. PhonePe' : 'e.g. State Bank of India'} {...register('institution')} />
          </Field>
          {isBank && (
            <Field label="Account category" error={errors.subtype?.message}>
              <Select {...register('subtype')}>
                {BANK_SUBTYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {(isCredit || isDebit) && (
            <Field label="Card network" error={errors.network?.message}>
              <Select {...register('network')}>
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {isUpi && (
            <Field label="UPI ID" error={errors.upi_id?.message}>
              <TextInput placeholder="name@bank" {...register('upi_id')} />
            </Field>
          )}
          {isDigital && (
            <Field label="Wallet identifier" error={errors.identifier?.message}>
              <TextInput placeholder="e.g. registered mobile / email" {...register('identifier')} />
            </Field>
          )}
        </div>
      )}

      {(isBank || isCredit || isDebit) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label={isBank ? 'Account number — last 4' : 'Card number — last 4'}
            error={errors.last_four_digits?.message}
          >
            <TextInput inputMode="numeric" maxLength={4} placeholder="1234" {...register('last_four_digits')} />
          </Field>
          {isBank && (
            <Field label="IFSC (optional)" error={errors.ifsc?.message} className="sm:col-span-2">
              <TextInput placeholder="ABCD0123456" {...register('ifsc')} />
            </Field>
          )}
          {(isCredit || isDebit) && (
            <>
              <Field label="Expiry month" error={errors.expiry_month?.message}>
                <Select {...register('expiry_month')}>
                  <option value="">MM</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expiry year" error={errors.expiry_year?.message}>
                <Select {...register('expiry_year')}>
                  <option value="">YYYY</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
        </div>
      )}

      {(isCredit || isDebit) && (
        <Field label="Card colour">
          <Select
            {...register('theme')}
            renderOption={({ value, label }) => (
              <>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {value && palettes[value] && (
                  <span
                    aria-hidden="true"
                    className="h-6 w-10 shrink-0 rounded-[5px] ring-1 ring-black/10 dark:ring-white/15"
                    style={{ background: cardGradient(palettes[value]) }}
                  />
                )}
              </>
            )}
          >
            <option value="">Auto</option>
            {Object.entries(palettes).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isCredit ? (
          <>
            <Field label="Credit limit (₹)" error={errors.credit_limit?.message}>
              <MoneyInput {...register('credit_limit')} />
            </Field>
            <Field label="Current outstanding (₹)" error={errors.current_outstanding?.message}>
              <MoneyInput {...register('current_outstanding')} />
            </Field>
          </>
        ) : (
          <Field
            label={isCash ? 'Opening balance (₹)' : isDebit ? 'Available balance (₹)' : 'Opening balance (₹)'}
            error={errors.opening_balance?.message}
            hint={editing ? 'Editing this does not adjust the running balance' : undefined}
          >
            <MoneyInput {...register('opening_balance')} />
          </Field>
        )}
        <Field label="Currency">
          <Select {...register('currency')}>
            <option value="INR">INR — ₹</option>
            <option value="USD">USD — $</option>
            <option value="EUR">EUR — €</option>
            <option value="GBP">GBP — £</option>
          </Select>
        </Field>
      </div>

      <Field label="Notes">
        <Textarea placeholder="Optional" {...register('notes')} />
      </Field>

      <p className="text-xs text-ink-soft">
        MoneyFlow never stores full card numbers, CVV, PIN, OTP or banking passwords — only the last 4
        digits and the details above.
      </p>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
        </button>
      </div>
    </form>
  )
}
