import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import Logo from '../common/Logo'
import { useAuth } from '../../features/auth/AuthProvider'

const NAV_LINKS = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/contact', label: 'Contact' },
]

export default function PublicHeader() {
  const { session, loading } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur dark:border-white/10 dark:bg-[#0F1614]/80">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="shrink-0">
          <Logo withText />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  isActive ? 'text-ink' : 'text-ink-soft hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5 dark:hover:text-white'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!loading && session ? (
            <Link to="/dashboard" className="btn-primary hidden sm:inline-flex">
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost hidden sm:inline-flex">
                Log in
              </Link>
              <Link to="/register" className="btn-primary hidden sm:inline-flex">
                Get Started
              </Link>
            </>
          )}
          <button
            className="btn-ghost !p-2 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line px-4 py-3 md:hidden dark:border-white/10">
          <nav className="flex flex-col gap-0.5">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5 dark:hover:text-white"
              >
                {l.label}
              </NavLink>
            ))}
            {!loading && !session && (
              <div className="mt-2 flex gap-2 border-t border-line pt-3 dark:border-white/10">
                <Link to="/login" className="btn-ghost flex-1 justify-center" onClick={() => setOpen(false)}>
                  Log in
                </Link>
                <Link to="/register" className="btn-primary flex-1 justify-center" onClick={() => setOpen(false)}>
                  Get Started
                </Link>
              </div>
            )}
            {!loading && session && (
              <Link to="/dashboard" className="btn-primary mt-2 justify-center" onClick={() => setOpen(false)}>
                Dashboard
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
