import { LayoutGrid, List } from 'lucide-react'
import clsx from 'clsx'

export default function AccountToolbar({ view, setView }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">Your Accounts</h2>
      <div className="flex rounded-xl border border-line p-0.5 dark:border-white/10">
        <button
          onClick={() => setView('grid')}
          aria-label="Grid view"
          aria-pressed={view === 'grid'}
          className={clsx('rounded-lg p-1.5 transition', view === 'grid' ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft')}
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          onClick={() => setView('list')}
          aria-label="List view"
          aria-pressed={view === 'list'}
          className={clsx('rounded-lg p-1.5 transition', view === 'list' ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft')}
        >
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
