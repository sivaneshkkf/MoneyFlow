import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, UserX, UserCheck, Users } from 'lucide-react'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatDate } from '../../../utils/format'
import AdminDataTable from '../components/AdminDataTable'
import AdminFilters from '../components/AdminFilters'
import AdminRowMenu from '../components/AdminRowMenu'
import ConfirmAdminAction from '../components/ConfirmAdminAction'
import UserStatusBadge from '../components/UserStatusBadge'
import SubscriptionStatusBadge from '../components/SubscriptionStatusBadge'
import { useAdminUsers, useAdminUserMutations } from '../hooks/useAdminUsers'
import { PAGE_SIZE } from '../adminMeta'

const PLAN_OPTIONS = [
  { value: '', label: 'All plans' },
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
]
const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [planSlug, setPlanSlug] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [suspendTarget, setSuspendTarget] = useState(null) // { user_id, action }

  const filters = { search, planSlug, status, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  const { data, isLoading, isError, error, refetch } = useAdminUsers(filters)
  const { suspend, reactivate } = useAdminUserMutations(suspendTarget?.user_id)

  const act = async (fn, msg) => {
    try {
      await fn()
      toast.success(msg)
      setSuspendTarget(null)
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
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-900">
            {(r.full_name || r.email || '?').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{r.full_name || 'Unnamed'}</p>
            <p className="truncate text-xs text-ink-soft">{r.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'plan', header: 'Plan', render: (r) => <span className="font-semibold uppercase">{r.plan_name ?? '—'}</span> },
    { key: 'sub_status', header: 'Subscription', render: (r) => <SubscriptionStatusBadge status={r.subscription_status} /> },
    { key: 'status', header: 'Status', render: (r) => <UserStatusBadge status={r.status} /> },
    { key: 'joined', header: 'Joined', render: (r) => formatDate(r.created_at) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <AdminRowMenu
            items={[
              { label: 'View', icon: Eye, onClick: () => navigate(`/admin/users/${r.user_id}`) },
              r.status === 'suspended'
                ? { label: 'Reactivate', icon: UserCheck, onClick: () => setSuspendTarget({ user_id: r.user_id, action: 'reactivate', name: r.full_name || r.email }) }
                : { label: 'Suspend', icon: UserX, tone: 'danger', onClick: () => setSuspendTarget({ user_id: r.user_id, action: 'suspend', name: r.full_name || r.email }) },
            ]}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-ink-soft">Search, filter and manage every MoneyFlow account.</p>
      </div>

      <AdminFilters
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(0)
        }}
        searchPlaceholder="Search by name or email…"
        filters={[
          { key: 'plan', value: planSlug, onChange: (v) => { setPlanSlug(v); setPage(0) }, options: PLAN_OPTIONS },
          { key: 'status', value: status, onChange: (v) => { setStatus(v); setPage(0) }, options: STATUS_OPTIONS },
        ]}
      />

      <AdminDataTable
        columns={columns}
        rows={data?.rows}
        loading={isLoading}
        error={isError ? error : null}
        onRetry={refetch}
        emptyIcon={Users}
        emptyTitle="No users found"
        emptyDescription="Try a different search or filter."
        page={page}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(r) => r.user_id}
        onRowClick={(r) => navigate(`/admin/users/${r.user_id}`)}
      />

      <ConfirmAdminAction
        open={Boolean(suspendTarget)}
        onClose={() => setSuspendTarget(null)}
        loading={suspend.isPending || reactivate.isPending}
        tone={suspendTarget?.action === 'suspend' ? 'danger' : 'primary'}
        title={suspendTarget?.action === 'suspend' ? `Suspend ${suspendTarget?.name}?` : `Reactivate ${suspendTarget?.name}?`}
        message={
          suspendTarget?.action === 'suspend'
            ? 'They will be signed out and unable to sign back in until reactivated.'
            : 'They will be able to sign in again immediately.'
        }
        confirmLabel={suspendTarget?.action === 'suspend' ? 'Suspend user' : 'Reactivate user'}
        onConfirm={(reason) =>
          suspendTarget?.action === 'suspend'
            ? act(() => suspend.mutateAsync({ userId: suspendTarget.user_id, reason }), 'User suspended.')
            : act(() => reactivate.mutateAsync({ userId: suspendTarget.user_id, reason }), 'User reactivated.')
        }
      />
    </div>
  )
}
