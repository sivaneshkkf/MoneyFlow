import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { Plus, Trash2, Pencil, MoreVertical, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import clsx from 'clsx'
import { Badge, EmptyState, Skeleton } from '../../components/common'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { Field, Select, TextInput } from '../../components/common/form'
import CategoryIcon from '../../components/categories/CategoryIcon'
import CategoryIconPicker from '../../components/categories/CategoryIconPicker'
import { FALLBACK_ICON_NAME, suggestIcon } from '../../components/categories/categoryIcons'
import { useCategories, useCategoryMutations } from '../categories/useCategories'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const COLORS = ['#315C54', '#2F6F63', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444', '#0EA5E9', '#7C9B95']

function CategoryForm({ initial, onDone }) {
  const toast = useToast()
  const { create, update } = useCategoryMutations()
  const editing = Boolean(initial?.id)
  const iconTouched = useRef(editing)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      name: initial?.name ?? '',
      type: initial?.type ?? 'expense',
      color: initial?.color ?? COLORS[0],
      icon: initial?.icon || (initial?.name ? suggestIcon(initial.name) : null) || FALLBACK_ICON_NAME,
    },
  })

  const name = watch('name')
  const color = watch('color')
  const icon = watch('icon')

  // Suggest an icon from the name until the user picks one manually (create only).
  useEffect(() => {
    if (iconTouched.current) return
    const s = suggestIcon(name)
    setValue('icon', s || FALLBACK_ICON_NAME)
  }, [name, setValue])

  register('icon', { required: true })
  register('color')

  const onSubmit = async (values) => {
    if (!values.name.trim()) return
    const payload = { ...values, icon: values.icon || FALLBACK_ICON_NAME }
    try {
      if (editing) await update.mutateAsync({ id: initial.id, ...payload })
      else await create.mutateAsync(payload)
      toast.success(editing ? 'Category updated.' : 'Category created.')
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
          <p className="truncate text-sm font-semibold">{name?.trim() || 'New category'}</p>
          <p className="text-xs text-ink-soft">Preview</p>
        </div>
      </div>

      <Field label="Type">
        <Select {...register('type')} disabled={editing}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </Select>
      </Field>

      <Field label="Name">
        <TextInput {...register('name')} autoFocus />
      </Field>

      <Field label="Icon">
        <CategoryIconPicker
          value={icon}
          accent={color}
          onChange={(n) => {
            iconTouched.current = true
            setValue('icon', n, { shouldDirty: true })
          }}
        />
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
              className={clsx(
                'h-8 w-8 rounded-full transition',
                color === c ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#161F1D]' : 'hover:scale-110',
              )}
              style={{ background: c, boxShadow: color === c ? `0 0 0 2px ${c}` : undefined }}
            />
          ))}
        </div>
      </Field>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {editing ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  )
}

function RowMenu({ category, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 160) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={`More actions for ${category.name}`}
        className="rounded-lg p-1.5 text-ink-soft hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: 160, zIndex: 100 }}
            className="overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl dark:border-white/10 dark:bg-[#161F1D]"
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-brand-50 dark:hover:bg-white/5"
              onClick={() => {
                setOpen(false)
                onEdit()
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            {!category.is_default && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10"
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

const CARD_META = {
  expense: { title: 'Expense Categories', Icon: ArrowUpRight, pill: 'bg-danger/10 text-danger', chip: 'bg-danger/12 text-danger' },
  income: { title: 'Income Categories', Icon: ArrowDownLeft, pill: 'bg-success/10 text-success', chip: 'bg-success/12 text-success' },
}

export default function CategoriesPage() {
  const { data: categories, isLoading } = useCategories()
  const { remove } = useCategoryMutations()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const groups = {
    expense: (categories ?? []).filter((c) => c.type === 'expense'),
    income: (categories ?? []).filter((c) => c.type === 'income'),
  }

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Category deleted.')
      setDeleting(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (c) => {
    setEditing(c)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Categories</h2>
          <p className="text-xs text-ink-soft">Organise income and spending with icons and colours.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>
          <Plus className="h-4 w-4" /> New category
        </button>
      </div>

      {(categories ?? []).length === 0 ? (
        <EmptyState title="No categories" description="Default categories are seeded on first sign-in." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {['expense', 'income'].map((type) => {
            const meta = CARD_META[type]
            const list = groups[type]
            return (
              <div key={type} className="card p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className={clsx('grid h-10 w-10 place-items-center rounded-xl', meta.chip)}>
                    <meta.Icon className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold">{meta.title}</h3>
                  </div>
                  <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', meta.pill)}>
                    {list.length} {list.length === 1 ? 'category' : 'categories'}
                  </span>
                </div>

                {list.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-soft">No {type} categories yet.</p>
                ) : (
                  <ul className="divide-y divide-line dark:divide-white/5">
                    {list.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-3">
                        <span
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                          style={{ background: `${c.color}1f`, color: c.color }}
                        >
                          <CategoryIcon name={c.icon} size={18} />
                        </span>
                        <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                        {c.is_default && <Badge tone="neutral">Default</Badge>}
                        <button
                          className="rounded-lg p-1.5 text-ink-soft hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5"
                          onClick={() => openEdit(c)}
                          aria-label={`Edit ${c.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <RowMenu category={c} onEdit={() => openEdit(c)} onDelete={() => setDeleting(c)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit category' : 'New category'}
        size="sm"
      >
        <CategoryForm initial={editing} onDone={() => setFormOpen(false)} />
      </Modal>
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete category?"
        message="Transactions using it will become uncategorized."
        confirmLabel="Delete"
        loading={remove.isPending}
      />
    </div>
  )
}
