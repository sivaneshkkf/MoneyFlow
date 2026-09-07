import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { mobileNav } from './navConfig'

const itemClass = (isActive) =>
  clsx(
    'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition',
    isActive ? 'text-brand-700 dark:text-brand-400' : 'text-ink-soft',
  )

/**
 * Bottom tab bar for the 4 most important sections plus a "More" tab that
 * opens the full nav drawer (MobileSidebarDrawer) — everything else
 * (Income, Expenses, Budgets, Bills, Goals, Money Received, Reports,
 * Settings…) lives there instead of being squeezed into 5 tabs.
 */
export default function MobileNavigation({ onMore }) {
  const primary = mobileNav.slice(0, -1)
  const more = mobileNav[mobileNav.length - 1]

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#131B19]/95 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch justify-around">
        {primary.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink to={item.to} className={({ isActive }) => itemClass(isActive)}>
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          </li>
        ))}
        <li className="flex-1">
          <button type="button" onClick={onMore} className={clsx(itemClass(false), 'w-full')} aria-label="More">
            <more.icon className="h-5 w-5" />
            {more.label}
          </button>
        </li>
      </ul>
    </nav>
  )
}
