import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { formatDate } from '../../../utils/format'
import AdminDataTable from '../components/AdminDataTable'
import AdminFilters from '../components/AdminFilters'
import { useAdminAuditLogs } from '../hooks/useAdminAuditLogs'
import { AUDIT_ACTIONS, auditActionMeta, PAGE_SIZE } from '../adminMeta'

const ACTION_OPTIONS = [{ value: '', label: 'All actions' }, ...AUDIT_ACTIONS.map((a) => ({ value: a, label: auditActionMeta(a).label }))]

export default function AdminAuditLogsPage() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(0)
  const { data, isLoading, isError, error, refetch } = useAdminAuditLogs({ action, limit: PAGE_SIZE, offset: page * PAGE_SIZE })

  const columns = [
    {
      key: 'action',
      header: 'Action',
      primary: true,
      render: (r) => {
        const meta = auditActionMeta(r.action)
        return (
          <span className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400">
              <meta.icon className="h-3.5 w-3.5" />
            </span>
            {meta.label}
          </span>
        )
      },
    },
    { key: 'admin', header: 'Admin', render: (r) => r.admin_email ?? '—' },
    { key: 'target', header: 'Target', render: (r) => r.target_email ?? '—' },
    { key: 'resource', header: 'Resource', render: (r) => r.resource_type ?? '—' },
    {
      key: 'details',
      header: 'Details',
      render: (r) => (
        <span className="truncate text-xs text-ink-soft">
          {r.metadata?.reason ? `“${r.metadata.reason}”` : Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata) : '—'}
        </span>
      ),
    },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.created_at) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="mt-1 text-sm text-ink-soft">Every sensitive admin action, who did it, and why.</p>
      </div>

      <AdminFilters filters={[{ key: 'action', value: action, onChange: (v) => { setAction(v); setPage(0) }, options: ACTION_OPTIONS }]} />

      <AdminDataTable
        columns={columns}
        rows={data?.rows}
        loading={isLoading}
        error={isError ? error : null}
        onRetry={refetch}
        emptyIcon={ShieldCheck}
        emptyTitle="No audit events yet"
        emptyDescription="Sensitive admin actions will be recorded here."
        page={page}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(r) => r.log_id}
      />
    </div>
  )
}
