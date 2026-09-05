import { NavLink, Link } from 'react-router-dom'
import clsx from 'clsx'
import { ShieldCheck, ArrowLeft } from 'lucide-react'
import { ADMIN_NAV } from '../adminMeta'

function NavList({ onNavigate }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {ADMIN_NAV.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-dark text-white dark:bg-brand-700'
                        : 'text-ink-soft hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5 dark:hover:text-white',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export default function AdminSidebar() {
  return (
    <aside className="no-print hidden h-full w-64 shrink-0 flex-col border-r border-line bg-white dark:border-white/10 dark:bg-[#131B19] lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-dark to-brand-700 text-white">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">MoneyFlow</p>
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Admin</p>
        </div>
      </div>
      <NavList />
      <div className="border-t border-line p-3 dark:border-white/10">
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5"
        >
          <ArrowLeft className="h-4 w-4" /> Back to MoneyFlow
        </Link>
      </div>
    </aside>
  )
}

export function AdminSidebarDrawer({ open, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-[#131B19]">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-dark to-brand-700 text-white">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">MoneyFlow</p>
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Admin</p>
          </div>
        </div>
        <NavList onNavigate={onClose} />
        <div className="border-t border-line p-3 dark:border-white/10">
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4" /> Back to MoneyFlow
          </Link>
        </div>
      </aside>
    </div>
  )
}
