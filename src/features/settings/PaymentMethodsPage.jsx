import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, Trash2, Pencil, Search, GripVertical } from 'lucide-react'
import clsx from 'clsx'
import { EmptyState, Skeleton } from '../../components/common'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { Field, TextInput, Textarea } from '../../components/common/form'
import CategoryIcon from '../../components/categories/CategoryIcon'
import CategoryIconPicker from '../../components/categories/CategoryIconPicker'
import { FALLBACK_ICON_NAME } from '../../components/categories/categoryIcons'
import { usePaymentMethods, usePaymentMethodMutations } from './usePaymentMethods'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const COLORS = ['#2F6F63', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444', '#0EA5E9', '#7C9B95']

// Presentation fallback for rows created before migration 019 (or by the seed
// for brand-new users). Never affects transaction logic.
const META = {
  Cash: { icon: 'Banknote', color: '#F59E0B', description: 'Physical cash payment' },
  UPI: { icon: 'Smartphone', color: '#EC4899', description: 'Google Pay, PhonePe, Paytm, etc.' },
  'Bank Transfer': { icon: 'Landmark', color: '#2F6F63', description: 'Direct bank account transfer' },
  'Credit Card': { icon: 'CreditCard', color: '#3B82F6', description: 'Visa, Mastercard, etc.' },
  'Debit Card': { icon: 'CreditCard', color: '#8B5CF6', description: 'Direct debit card payment' },
  Wallet: { icon: 'Wallet', color: '#0EA5E9', description: 'Digital wallet payment' },
  Other: { icon: FALLBACK_ICON_NAME, color: '#7C9B95', description: 'Other payment method' },
}

const view = (m) => ({
  ...m,
  icon: m.icon || META[m.name]?.icon || FALLBACK_ICON_NAME,
  color: m.color || META[m.name]?.color || '#7C9B95',
  description: m.description || META[m.name]?.description || '',
})

function PaymentMethodForm({ initial, onDone }) {
  const toast = useToast()
  const { create, update } = usePaymentMethodMutations()
  const editing = Boolean(initial?.id)
  const base = initial ? view(initial) : null
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      name: base?.name ?? '',
      description: base?.description ?? '',
      icon: base?.icon ?? 'CreditCard',
      color: base?.color ?? COLORS[0],
      is_active: base ? base.is_active !== false : true,
    },
  })
  register('icon', { required: true })
  register('color')
  register('is_active')

  const name = watch('name')
  const description = watch('description')
  const icon = watch('icon')
  const color = watch('color')
  const isActive = watch('is_active')

  const onSubmit = async (values) => {
    if (!values.name.trim()) return
    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      icon: values.icon || FALLBACK_ICON_NAME,
      color: values.color,
      is_active: Boolean(values.is_active),
    }
    try {
      if (editing) await update.mutateAsync({ id: initial.id, ...payload })
      else await create.mutateAsync(payload)
      toast.success(editing ? 'Payment method updated.' : 'Payment method added.')
      onDone()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-line p-3 dark:border-white/10">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white" style={{ background: color }}>
          <CategoryIcon name={icon} size={22} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name?.trim() || 'New method'}</p>
          <p className="truncate text-xs text-ink-soft">{description?.trim() || 'Preview'}</p>
        </div>
      </div>

      <Field label="Name">
        <TextInput {...register('name')} autoFocus placeholder="e.g. Amazon Pay" />
      </Field>

      <Field label="Description">
        <Textarea {...register('description')} rows={2} placeholder="Short description shown in the list" />
      </Field>

      <Field label="Icon">
        <CategoryIconPicker value={icon} accent={color} onChange={(n) => setValue('icon', n, { shouldDirty: true })} />
      </Field>

      <Field label="Colour">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setValue('color', c, { shouldDirty: true })}
              className={clsx('h-8 w-8 rounded-full transition', color === c ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#161F1D]' : 'hover:scale-110')}
              style={{ background: c, boxShadow: color === c ? `0 0 0 2px ${c}` : undefined }}
            />
          ))}
        </div>
      </Field>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm dark:border-white/10">
        <span>
          <span className="font-medium">Active</span>
          <span className="block text-xs text-ink-soft">Show this method when adding transactions.</span>
        </span>
        <input type="checkbox" className="h-4 w-4" checked={Boolean(isActive)} onChange={(e) => setValue('is_active', e.target.checked, { shouldDirty: true })} />
      </label>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {editing ? 'Save' : 'Add method'}
        </button>
      </div>
    </form>
  )
}

export default function PaymentMethodsPage() {
  const { data: methods, isLoading } = usePaymentMethods()
  const { remove, reorder } = usePaymentMethodMutations()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [order, setOrder] = useState([])
  const dragId = useRef(null)

  const serverSig = (methods ?? []).map((m) => m.id).join(',')
  useEffect(() => {
    if (methods) setOrder(methods.map((m) => m.id))
  }, [serverSig]) // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map((methods ?? []).map((m) => [m.id, m]))
  const ordered = order.map((id) => byId.get(id)).filter(Boolean)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? ordered.filter((m) => m.name.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q))
    : ordered
  const dragEnabled = !q

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Payment method removed.')
      setDeleting(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const handleDrop = async (targetId) => {
    const from = order.indexOf(dragId.current)
    const to = order.indexOf(targetId)
    dragId.current = null
    if (from === -1 || to === -1 || from === to) return
    const next = [...order]
    next.splice(to, 0, next.splice(from, 1)[0])
    setOrder(next)
    try {
      await reorder.mutateAsync(next)
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to save the new order.'))
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            className="input pl-10"
            placeholder="Search payment methods… (e.g. Amazon Pay)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="btn-primary shrink-0"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4" /> Add Method
        </button>
      </div>

      {(methods ?? []).length === 0 ? (
        <EmptyState title="No payment methods" description="Add the ways you pay to tag transactions." />
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink-soft">No payment methods match “{query}”.</div>
      ) : (
        <div className="card divide-y divide-line p-2 dark:divide-white/5">
          {filtered.map((raw) => {
            const m = view(raw)
            return (
              <div
                key={m.id}
                draggable={dragEnabled}
                onDragStart={() => (dragId.current = m.id)}
                onDragOver={(e) => dragEnabled && e.preventDefault()}
                onDrop={() => dragEnabled && handleDrop(m.id)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-brand-50/60 dark:hover:bg-white/5"
              >
                <GripVertical
                  className={clsx('h-4 w-4 shrink-0 text-ink-soft/60', dragEnabled ? 'cursor-grab active:cursor-grabbing' : 'opacity-30')}
                />
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                  style={{ background: `${m.color}1f`, color: m.color }}
                >
                  <CategoryIcon name={m.icon} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.name}</p>
                  {m.description && <p className="truncate text-xs text-ink-soft">{m.description}</p>}
                </div>

                <span
                  className={clsx(
                    'hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex',
                    m.is_active !== false ? 'bg-success/10 text-success' : 'bg-ink-soft/10 text-ink-soft',
                  )}
                >
                  <span className={clsx('h-1.5 w-1.5 rounded-full', m.is_active !== false ? 'bg-success' : 'bg-ink-soft')} />
                  {m.is_active !== false ? 'Active' : 'Inactive'}
                </span>

                <button
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:border-white/10 dark:hover:bg-white/5"
                  onClick={() => {
                    setEditing(raw)
                    setFormOpen(true)
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  className="shrink-0 rounded-lg border border-danger/30 p-1.5 text-danger transition hover:bg-danger/10"
                  onClick={() => setDeleting(raw)}
                  aria-label={`Delete ${m.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit payment method' : 'Add payment method'}
        size="sm"
      >
        <PaymentMethodForm initial={editing} onDone={() => setFormOpen(false)} />
      </Modal>
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Remove payment method?"
        message="Transactions using it will keep their record but lose the tag."
        confirmLabel="Remove"
        loading={remove.isPending}
      />
    </div>
  )
}
