import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  TrendingDown,
  TrendingUp,
  HandCoins,
  Target,
  PiggyBank,
  BarChart3,
  FileText,
  ArrowLeftRight,
  Wallet,
  Receipt,
  CornerDownLeft,
} from 'lucide-react'
import { useQuickActions } from './QuickActionsProvider'
import { useGlobalSearch } from './useGlobalSearch'
import { formatCurrency } from '../../utils/format'

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const { open: runAction } = useQuickActions()
  const { data: results, isFetching } = useGlobalSearch(term)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const openEvt = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', openEvt)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-command-palette', openEvt)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setTerm('')
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  const go = (path) => {
    navigate(path)
    setOpen(false)
  }
  const act = (a) => {
    runAction(a)
    setOpen(false)
  }

  const actions = useMemo(
    () => [
      { label: 'Add Expense', icon: TrendingDown, run: () => act('expense') },
      { label: 'Add Income', icon: TrendingUp, run: () => act('income') },
      { label: 'Add Lent Money', icon: HandCoins, run: () => act('lending') },
      { label: 'Create Budget', icon: PiggyBank, run: () => act('budget') },
      { label: 'Create Goal', icon: Target, run: () => act('goal') },
      { label: 'Record Repayment', icon: CornerDownLeft, run: () => go('/lending/given') },
      { label: 'Open Transactions', icon: ArrowLeftRight, run: () => go('/transactions') },
      { label: 'Open Analytics', icon: BarChart3, run: () => go('/analytics') },
      { label: 'Open Reports', icon: FileText, run: () => go('/reports') },
      { label: 'Open Accounts', icon: Wallet, run: () => go('/accounts') },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const filteredActions = term
    ? actions.filter((a) => a.label.toLowerCase().includes(term.toLowerCase()))
    : actions

  if (!open) return null

  const hasResults =
    results &&
    (results.transactions.length ||
      results.lending.length ||
      results.accounts.length ||
      results.categories.length ||
      results.goals.length)

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[10vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#161F1D]">
        <div className="flex items-center gap-2 border-b border-line px-4 dark:border-white/10">
          <Search className="h-4 w-4 text-ink-soft" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search or run a command…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-ink-soft"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-soft dark:border-white/10">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredActions.length > 0 && (
            <Group label="Actions">
              {filteredActions.map((a) => (
                <Item key={a.label} icon={a.icon} onClick={a.run}>
                  {a.label}
                </Item>
              ))}
            </Group>
          )}

          {term.length >= 2 && (
            <>
              {isFetching && <p className="px-3 py-2 text-xs text-ink-soft">Searching…</p>}
              {!isFetching && !hasResults && (
                <p className="px-3 py-2 text-xs text-ink-soft">No matching records.</p>
              )}
              {results?.transactions.length > 0 && (
                <Group label="Transactions">
                  {results.transactions.map((t) => (
                    <Item key={t.id} icon={Receipt} onClick={() => go('/transactions')}>
                      <span className="flex-1 truncate">{t.description || 'Untitled'}</span>
                      <span className={t.type === 'income' ? 'text-success' : 'text-danger'}>
                        {t.type === 'income' ? '+' : '-'}
                        {formatCurrency(t.amount)}
                      </span>
                    </Item>
                  ))}
                </Group>
              )}
              {results?.lending.length > 0 && (
                <Group label="Lending">
                  {results.lending.map((l) => (
                    <Item key={l.id} icon={HandCoins} onClick={() => go(`/lending/${l.id}`)}>
                      <span className="flex-1 truncate">{l.borrower_name}</span>
                      <span className="text-warning">
                        {formatCurrency(Number(l.outstanding_principal) + Number(l.outstanding_interest))}
                      </span>
                    </Item>
                  ))}
                </Group>
              )}
              {results?.accounts.length > 0 && (
                <Group label="Accounts">
                  {results.accounts.map((a) => (
                    <Item key={a.id} icon={Wallet} onClick={() => go('/accounts')}>
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="text-ink-soft">{formatCurrency(a.current_balance)}</span>
                    </Item>
                  ))}
                </Group>
              )}
              {results?.goals.length > 0 && (
                <Group label="Goals">
                  {results.goals.map((g) => (
                    <Item key={g.id} icon={Target} onClick={() => go('/goals')}>
                      <span className="flex-1 truncate">{g.name}</span>
                      <span className="text-ink-soft">
                        {formatCurrency(g.current_amount)} / {formatCurrency(g.target_amount)}
                      </span>
                    </Item>
                  ))}
                </Group>
              )}
              {results?.categories.length > 0 && (
                <Group label="Categories">
                  {results.categories.map((c) => (
                    <Item key={c.id} icon={ArrowLeftRight} onClick={() => go(c.type === 'income' ? '/income' : '/expenses')}>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-ink-soft capitalize">{c.type}</span>
                    </Item>
                  ))}
                </Group>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Group({ label, children }) {
  return (
    <div className="mb-1">
      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{label}</p>
      {children}
    </div>
  )
}

function Item({ icon: Icon, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-white/5"
    >
      <Icon className="h-4 w-4 shrink-0 text-ink-soft" />
      {children}
    </button>
  )
}
