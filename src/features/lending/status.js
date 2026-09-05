export const STATUS_META = {
  active: { label: 'Active', tone: 'info' },
  partially_paid: { label: 'Partially Paid', tone: 'warning' },
  fully_paid: { label: 'Fully Paid', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  written_off: { label: 'Written Off', tone: 'neutral' },
}

export const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'partially_paid', label: 'Partially Paid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'fully_paid', label: 'Fully Paid' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'written_off', label: 'Written Off' },
]
