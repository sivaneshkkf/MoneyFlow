import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, ChevronDown, User, ArrowLeft, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useProfile } from '../../settings/useProfile'

export default function AdminHeader({ onMenuClick }) {
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const name = profile?.full_name || user?.email || 'Admin'

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur dark:border-white/10 dark:bg-[#0F1614]/80 sm:px-6">
      <div className="flex items-center gap-3">
        <button className="btn-ghost !p-2 lg:hidden" onClick={onMenuClick} aria-label="Open menu">
          <Menu className="h-4 w-4" />
        </button>
        <p className="hidden text-sm font-semibold text-ink-soft sm:block">MoneyFlow Admin</p>
      </div>

      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"
          aria-label="Switch to MoneyFlow"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">MoneyFlow</span>
        </Link>

        <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-1.5 text-sm font-medium transition hover:bg-brand-50 dark:border-white/10 dark:hover:bg-white/5"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-900">
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="hidden max-w-[10rem] truncate sm:inline">{name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-soft" />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl dark:border-white/10 dark:bg-[#161F1D]"
          >
            <div className="border-b border-line px-3 py-2 dark:border-white/10">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin session
              </p>
              <p className="truncate text-xs text-ink-soft">{user?.email}</p>
            </div>
            <Link to="/settings/profile" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-brand-50 dark:hover:bg-white/5" onClick={() => setOpen(false)}>
              <User className="h-3.5 w-3.5" /> My Profile
            </Link>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
              onClick={signOut}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </button>
          </div>
        )}
        </div>
      </div>
    </header>
  )
}
