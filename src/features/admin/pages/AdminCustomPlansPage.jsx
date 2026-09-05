import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import AdminDataTable from '../components/AdminDataTable'
import AdminFilters from '../components/AdminFilters'
import CustomOfferFormModal from '../components/CustomOfferFormModal'
import CustomPlanDetailModal from '../components/CustomPlanDetailModal'
import { useAdminCustomPlanRequests, useAdminCustomPlanMutations } from '../hooks/useAdminCustomPlans'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatCurrency, formatDate } from '../../../utils/format'
import { CUSTOM_PLAN_STATUS_META, OFFER_SOURCE_META, CUSTOM_PLAN_FILTERS } from '../../subscription/customPlanMeta'
import { Badge } from '../../../components/common'
import { PAGE_SIZE } from '../adminMeta'

const SOURCE_TABS = [
  { key: '', label: 'All' },
  { key: 'user_request', label: 'User Requests' },
  { key: 'admin_direct', label: 'Direct Offers' },
]
const STATUS_OPTIONS = CUSTOM_PLAN_FILTERS.map((f) => ({ value: f.key, label: f.label }))

export default function AdminCustomPlansPage() {
  const [source, setSource] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const filters = { source, status, search, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  const { data, isLoading, isError, error, refetch } = useAdminCustomPlanRequests(filters)
  const { createOffer } = useAdminCustomPlanMutations()
  const toast = useToast()

  const submitCreate = async (payload) => {
    try {
      await createOffer.mutateAsync({
        userId: payload.customerId, price: payload.adminPrice, billingCycle: payload.billingCycle,
        description: payload.description, adminMessage: payload.adminMessage, validUntil: payload.validUntil,
      })
      toast.success('Custom offer sent.')
      setCreateOpen(false)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const columns = [
    {
      key: 'customer',
      header: 'Customer',
      primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.full_name || 'Unnamed'}</p>
          <p className="truncate text-xs text-ink-soft">{r.email}</p>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (r) => <Badge tone={OFFER_SOURCE_META[r.offer_source]?.tone ?? 'neutral'}>{OFFER_SOURCE_META[r.offer_source]?.label}</Badge>,
    },
    {
      key: 'price',
      header: 'Price',
      render: (r) =>
        r.offer_source === 'user_request' && r.requested_price != null && r.admin_price != null && Number(r.requested_price) !== Number(r.admin_price) ? (
          <span>{formatCurrency(r.requested_price)} → {formatCurrency(r.admin_price)}</span>
        ) : (
          <span>{formatCurrency(r.admin_price ?? r.requested_price ?? 0)}</span>
        ),
    },
    { key: 'billing', header: 'Billing', render: (r) => <span className="capitalize">{r.billing_cycle}</span> },
    { key: 'description', header: 'Description', render: (r) => <span className="truncate text-xs text-ink-soft">{r.description || '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={CUSTOM_PLAN_STATUS_META[r.status]?.tone ?? 'neutral'}>{CUSTOM_PLAN_STATUS_META[r.status]?.label ?? r.status}</Badge> },
    { key: 'created', header: 'Created', render: (r) => formatDate(r.created_at) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <button className="btn-ghost !py-1.5 text-xs" onClick={(e) => { e.stopPropagation(); setDetailId(r.id) }}>
          View
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Custom Plans</h1>
          <p className="mt-1 text-sm text-ink-soft">Requests customers sent in, and offers you&apos;ve created directly.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Create Custom Offer
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SOURCE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setSource(t.key); setPage(0) }}
            className={clsx(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
              source === t.key ? 'bg-dark text-white dark:bg-brand-700' : 'bg-brand-50 text-ink-soft hover:bg-brand-100 dark:bg-white/5',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AdminFilters
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(0) }}
        searchPlaceholder="Search by name or email…"
        filters={[{ key: 'status', value: status, onChange: (v) => { setStatus(v); setPage(0) }, options: STATUS_OPTIONS }]}
      />

      <AdminDataTable
        columns={columns}
        rows={data?.rows}
        loading={isLoading}
        error={isError ? error : null}
        onRetry={refetch}
        emptyIcon={Sparkles}
        emptyTitle="No custom plans yet"
        emptyDescription="Requests and direct offers will show up here."
        page={page}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(r) => r.id}
        onRowClick={(r) => setDetailId(r.id)}
      />

      <CustomOfferFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        loading={createOffer.isPending}
        onSubmit={submitCreate}
      />
      {detailId && <CustomPlanDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
