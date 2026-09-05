import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { Settings, User, SlidersHorizontal, Tag, CreditCard, Wallet, ShieldCheck, Sparkles } from 'lucide-react'
import { PageContainer } from '../../components/common'

const tabs = [
  { to: '/settings/profile', label: 'Profile', icon: User },
  { to: '/settings/preferences', label: 'Preferences', icon: SlidersHorizontal },
  { to: '/settings/categories', label: 'Categories', icon: Tag },
  { to: '/settings/accounts', label: 'Accounts', icon: CreditCard },
  { to: '/settings/payment-methods', label: 'Payment Methods', icon: Wallet },
  { to: '/settings/subscription', label: 'Subscription', icon: Sparkles },
  { to: '/settings/security', label: 'Security', icon: ShieldCheck },
]

export default function SettingsLayout() {
  return (
    <PageContainer>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -top-8 h-56 w-56 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.10), transparent 70%)' }}
        />

        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-success/12 text-success">
            <Settings className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-ink-soft">Manage your profile, preferences and data.</p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                clsx(
                  'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-dark text-white shadow-sm dark:bg-brand-700'
                    : 'text-ink-soft hover:bg-brand-50 dark:hover:bg-white/5',
                )
              }
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </NavLink>
          ))}
        </div>

        <Outlet />
      </div>
    </PageContainer>
  )
}
