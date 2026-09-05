import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Search, AlertTriangle } from 'lucide-react'
import Modal from '../../../components/common/Modal'
import { Field, Textarea, MoneyInput } from '../../../components/common/form'
import { getAdminUsers } from '../services/adminService'
import { formatCurrency } from '../../../utils/format'

function UserPicker({ selected, onSelect }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!q.trim()) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      getAdminUsers({ search: q.trim(), limit: 8 })
        .then(({ rows: r }) => {
          if (!cancelled) setRows(r)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-line p-3 text-sm dark:border-white/10">
        <div className="min-w-0">
          <p className="truncate font-medium">{selected.full_name || 'Unnamed'}</p>
          <p className="truncate text-xs text-ink-soft">{selected.email}</p>
        </div>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => onSelect(null)}>
          Change
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          className="input pl-9 text-sm"
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {q.trim() && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line dark:border-white/10">
          {loading ? (
            <p className="p-3 text-center text-xs text-ink-soft">Searching…</p>
          ) : rows.length === 0 ? (
            <p className="p-3 text-center text-xs text-ink-soft">No users found.</p>
          ) : (
            rows.map((r) => (
              <button
                type="button"
                key={r.user_id}
                onClick={() => onSelect(r)}
                className="flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-b-0 hover:bg-brand-50 dark:border-white/5 dark:hover:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.full_name || 'Unnamed'}</p>
                  <p className="truncate text-xs text-ink-soft">{r.email}</p>
                </div>
                <span className="shrink-0 text-xs uppercase text-ink-soft">{r.plan_name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * One form for all three ways a custom offer's price gets set:
 *   mode="create"  — admin picks a user and creates a brand-new offer
 *   mode="respond" — admin answers a user's request (accept price or counter)
 *   mode="edit"    — admin re-prices an already-offered row (WhatsApp negotiation)
 */
export default function CustomOfferFormModal({ open, onClose, mode, request, onSubmit, loading }) {
  const [customer, setCustomer] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    watch,
  } = useForm({ defaultValues: { admin_price: '', billing_cycle: 'monthly', description: '', admin_message: '', valid_until: '' } })

  useEffect(() => {
    if (!open) return
    setCustomer(null)
    reset({
      admin_price: mode === 'respond' ? (request?.requested_price ?? '') : (request?.admin_price ?? ''),
      billing_cycle: request?.billing_cycle ?? 'monthly',
      description: request?.description ?? '',
      admin_message: request?.admin_message ?? '',
      valid_until: request?.valid_until ? request.valid_until.slice(0, 10) : '',
    })
  }, [open, mode, request, reset])

  const alreadyPro = customer?.subscription_status === 'active' && customer?.plan_slug === 'pro'
  const title = mode === 'create' ? 'Create custom offer' : mode === 'respond' ? 'Respond to request' : 'Edit offer'

  const submit = (v) => {
    onSubmit({
      customerId: customer?.user_id,
      adminPrice: Number(v.admin_price),
      billingCycle: v.billing_cycle,
      description: v.description?.trim(),
      adminMessage: v.admin_message?.trim() || null,
      validUntil: v.valid_until ? new Date(v.valid_until).toISOString() : null,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        {mode === 'create' && (
          <Field label="Select Customer">
            <UserPicker selected={customer} onSelect={setCustomer} />
          </Field>
        )}
        {mode === 'create' && alreadyPro && (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/[0.07] p-3 text-sm dark:bg-warning/10">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>This user already has an active Pro subscription. Creating a custom offer will replace it once they pay.</span>
          </div>
        )}
        {request && (
          <div className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-white/5">
            <p className="font-medium">{request.full_name || request.email}</p>
            {mode === 'respond' && request.requested_price != null && (
              <p className="text-xs text-ink-soft">Requested: {formatCurrency(request.requested_price)}/{request.billing_cycle}</p>
            )}
            {request.description && <p className="mt-1 text-xs text-ink-soft">&ldquo;{request.description}&rdquo;</p>}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price">
            <MoneyInput {...register('admin_price')} placeholder="₹" />
          </Field>
          <Field label="Billing">
            <select className="input" {...register('billing_cycle')} disabled={mode === 'edit'}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </Field>
        </div>

        {mode !== 'edit' && (
          <Field label="Offer description">
            <Textarea {...register('description')} rows={2} placeholder="e.g. Custom plan for additional requirements." />
          </Field>
        )}

        <Field label="Message to customer (optional)">
          <Textarea {...register('admin_message')} rows={2} />
        </Field>

        <Field label="Offer valid until (optional)">
          <input type="date" className="input" {...register('valid_until')} />
        </Field>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || (mode === 'create' && !customer) || !watch('admin_price')}
          >
            {loading ? 'Saving…' : mode === 'create' ? 'Send Custom Offer' : mode === 'respond' ? 'Send Offer' : 'Update Offer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
