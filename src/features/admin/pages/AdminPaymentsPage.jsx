import { useState } from 'react'
import { Wallet } from 'lucide-react'
import Modal from '../../../components/common/Modal'
import { formatDate } from '../../../utils/format'
import AdminDataTable from '../components/AdminDataTable'
import AdminFilters from '../components/AdminFilters'
import { useAdminPayments } from '../hooks/useAdminPayments'
import { PAGE_SIZE, PAYMENT_EVENT_TYPES } from '../adminMeta'

const EVENT_OPTIONS = [{ value: '', label: 'All events' }, ...PAYMENT_EVENT_TYPES.map((t) => ({ value: t, label: t }))]

// Never render anything that looks like a secret/signature, even though the
// webhook itself never stores one in payload — this is defense in depth.
const REDACT_KEYS = /secret|signature|api[_-]?key|token/i
function redactPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  return Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, REDACT_KEYS.test(k) ? '••••••' : v]))
}

export default function AdminPaymentsPage() {
  const [eventType, setEventType] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)
  const { data, isLoading, isError, error, refetch } = useAdminPayments({ eventType, limit: PAGE_SIZE, offset: page * PAGE_SIZE })

  const columns = [
    { key: 'user', header: 'User', primary: true, render: (r) => r.email ?? '—' },
    { key: 'event', header: 'Event', render: (r) => <code className="text-xs">{r.event_type}</code> },
    { key: 'provider_id', header: 'Event ID', render: (r) => <span className="text-xs text-ink-soft">{r.provider_event_id ?? '—'}</span> },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.created_at) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Subscription lifecycle events recorded by the payment webhook. No amounts are shown until a payment provider is connected.
        </p>
      </div>

      <AdminFilters filters={[{ key: 'event', value: eventType, onChange: (v) => { setEventType(v); setPage(0) }, options: EVENT_OPTIONS }]} />

      <AdminDataTable
        columns={columns}
        rows={data?.rows}
        loading={isLoading}
        error={isError ? error : null}
        onRetry={refetch}
        emptyIcon={Wallet}
        emptyTitle="No payment events yet"
        emptyDescription="Events will appear here once the payment webhook starts receiving them."
        page={page}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(r) => r.event_id}
        onRowClick={setSelected}
      />

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Event details" size="md">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-ink-soft">Event type</p>
                <p className="font-semibold">{selected.event_type}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">User</p>
                <p className="font-semibold">{selected.email ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Provider event ID</p>
                <p className="font-mono text-xs">{selected.provider_event_id ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Received</p>
                <p className="font-semibold">{formatDate(selected.created_at)}</p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Payload</p>
              <pre className="max-h-64 overflow-auto rounded-xl bg-brand-50 p-3 text-xs dark:bg-white/5">
                {JSON.stringify(redactPayload(selected.payload), null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
