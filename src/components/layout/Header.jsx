import { Link } from 'react-router-dom'
import { Moon, Sun, Laptop, Search, ShieldCheck, Menu } from 'lucide-react'
import MoneyFlowLogo from '../branding/MoneyFlowLogo'
import { useTheme } from '../../features/settings/ThemeProvider'
import NotificationBell from '../../features/notifications/NotificationBell'
import PlanBadge from '../../features/subscription/components/PlanBadge'
import { useAdminAccess } from '../../features/admin/hooks/useAdmin'
import HelpMenu from './HelpMenu'
import InstallAppButton from './InstallAppButton'

export default function Header({ onMenuClick }) {
  const { theme, setTheme } = useTheme()
  const { isAdmin } = useAdminAccess()
  const next = { light: 'dark', dark: 'system', system: 'light' }
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop

  const openPalette = () => window.dispatchEvent(new CustomEvent('open-command-palette'))

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur dark:border-white/10 dark:bg-[#0F1614]/80 sm:px-6 lg:px-8">
      <div className="flex items-center gap-1 lg:hidden">
        <button className="btn-ghost !p-2" onClick={onMenuClick} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        {/* Icon-only below sm (the row is already crowded with search/help/
            bell/theme controls); full wordmark once there's room at sm+. */}
        <MoneyFlowLogo variant="icon" size="h-8 sm:hidden" to="/dashboard" />
        <span className="hidden sm:inline-flex">
          <MoneyFlowLogo size="h-8" to="/dashboard" />
        </span>
      </div>
      <button
        onClick={openPalette}
        className="hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink-soft transition hover:bg-brand-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 lg:flex"
      >
        <Search className="h-4 w-4" />
        <span>Search or run a command</span>
        <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] dark:border-white/10">⌘K</kbd>
      </button>
      <div className="flex items-center gap-2">
        <button className="btn-ghost !p-2 lg:hidden" onClick={openPalette} aria-label="Search">
          <Search className="h-4 w-4" />
        </button>
        <InstallAppButton />
        <HelpMenu />
        <PlanBadge className="hidden sm:inline-flex" />
        {isAdmin && (
          <Link
            to="/admin/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Switch to Admin Console"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Admin Console</span>
          </Link>
        )}
        <NotificationBell />
        <button
          className="btn-ghost !p-2"
          onClick={() => setTheme(next[theme])}
          aria-label={`Theme: ${theme}. Switch to ${next[theme]}`}
        >
          <Icon className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
