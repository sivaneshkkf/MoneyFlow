import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { LogOut } from 'lucide-react'
import Logo from '../common/Logo'
import { navSections } from './navConfig'
import { useAuth } from '../../features/auth/AuthProvider'
import { useProfile } from '../../features/settings/useProfile'

export default function Sidebar() {
  const { signOut } = useAuth()
  const { data: profile } = useProfile()

  return (
    <aside className="no-print hidden h-full w-64 shrink-0 flex-col border-r border-line bg-white dark:border-white/10 dark:bg-[#131B19] lg:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <Logo withText />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
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
      <div className="border-t border-line p-3 dark:border-white/10">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-900">
            {(profile?.full_name || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{profile?.full_name || 'MoneyFlow user'}</p>
            <p className="truncate text-xs text-ink-soft">{profile?.email}</p>
          </div>
          <button onClick={signOut} aria-label="Sign out" className="text-ink-soft hover:text-danger">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
