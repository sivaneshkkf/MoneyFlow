import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Eye, Ban, PlayCircle } from 'lucide-react'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatCurrency, formatDate } from '../../../utils/format'
import AdminDataTable from '../components/AdminDataTable'
import AdminFilters from '../components/AdminFilters'
import AdminRowMenu from '../components/AdminRowMenu'
import ConfirmAdminAction from '../components/ConfirmAdminAction'
import SubscriptionStatusBadge from '../components/SubscriptionStatusBadge'
import { useAdminSubscriptions, useAdminSubscriptionMutations } from '../hooks/useAdminSubscriptions'
import { PAGE_SIZE } from '../adminMeta'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'trialing', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
]
const PLAN_OPTIONS = [
  { value: '', label: 'All plans' },
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
]

export default function AdminSubscriptionsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [planSlug, setPlanSlug] = useState('')
  const [page, setPage] = useState(0)
  const [action, setAction] = useState(null) // { user_id, name, kind: 'cancel'|'resume' }

  const filters = { status, planSlug, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  const { data, isLoading, isError, error, refetch } = useAdminSubscriptions(filters)
  const { cancel, resume } = useAdminSubscriptionMutations()

  const act = async (fn, msg) => {
    try {
      await fn()
      toast.success(msg)
      setAction(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const columns = [
    {
      key: 'user',
      header: 'User',
      primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.full_name || 'Unnamed'}</p>
          <p className="truncate text-xs text-ink-soft">{r.email}</p>
        </div>
      ),
    },
    { key: 'plan', header: 'Plan', render: (r) => <span className="font-semibold uppercase">{r.plan_name}</span> },
    { key: 'status', header: 'Status', render: (r) => <SubscriptionStatusBadge status={r.status} /> },
    { key: 'cycle', header: 'Billing cycle', render: (r) => <span className="capitalize">{r.billing_cycle ?? '—'}</span> },
    {
      key: 'price',
      header: 'Price',
      render: (r) => (r.billing_cycle === 'yearly' ? formatCurrency(r.price_yearly) : formatCurrency(r.price_monthly)),
    },
    { key: 'renewal', header: 'Renewal date', render: (r) => (r.current_period_end ? formatDate(r.current_period_end) : '—') },
    { key: 'cancel_flag', header: 'Cancel at period end', render: (r) => (r.cancel_at_period_end ? <span className="text-warning">Yes</span> : 'No') },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <AdminRowMenu
            items={[
              { label: 'View user', icon: Eye, onClick: () => navigate(`/admin/users/${r.user_id}`) },
              ...(r.status === 'active' || r.status === 'trialing' || r.status === 'past_due'
                ? r.cancel_at_period_end
                  ? [{ label: 'Resume', icon: PlayCircle, onClick: () => setAction({ user_id: r.user_id, name: r.full_name || r.email, kind: 'resume' }) }]
                  : [{ label: 'Cancel', icon: Ban, tone: 'danger', onClick: () => setAction({ user_id: r.user_id, name: r.full_name || r.email, kind: 'cancel' }) }]
                : []),
            ]}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-sm text-ink-soft">Every user&apos;s current plan and billing status.</p>
      </div>

      <AdminFilters
        filters={[
          { key: 'status', value: status, onChange: (v) => { setStatus(v); setPage(0) }, options: STATUS_OPTIONS },
          { key: 'plan', value: planSlug, onChange: (v) => { setPlanSlug(v); setPage(0) }, options: PLAN_OPTIONS },
        ]}
      />

      <AdminDataTable
        columns={columns}
        rows={data?.rows}
        loading={isLoading}
        error={isError ? error : null}
        onRetry={refetch}
        emptyIcon={Sparkles}
        emptyTitle="No subscriptions found"
        page={page}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(r) => r.subscription_id}
        onRowClick={(r) => navigate(`/admin/users/${r.user_id}`)}
      />

      <ConfirmAdminAction
        open={action?.kind === 'cancel'}
        onClose={() => setAction(null)}
        loading={cancel.isPending}
        title="Cancel this subscription?"
        message="Pro access will remain active until the current billing period ends."
        confirmLabel="Cancel subscription"
        onConfirm={(reason) => act(() => cancel.mutateAsync({ userId: action.user_id, reason }), 'Subscription cancelled.')}
      />
      <ConfirmAdminAction
        open={action?.kind === 'resume'}
        onClose={() => setAction(null)}
        loading={resume.isPending}
        tone="primary"
        title="Resume this subscription?"
        message="The pending cancellation will be reverted."
        confirmLabel="Resume subscription"
        onConfirm={(reason) => act(() => resume.mutateAsync({ userId: action.user_id, reason }), 'Subscription resumed.')}
      />
    </div>
  )
}
