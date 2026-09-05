import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { mobileNav } from './navConfig'

export default function MobileNavigation() {
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#131B19]/95 lg:hidden">
      <ul className="flex items-stretch justify-around">
        {mobileNav.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition',
                  isActive ? 'text-brand-700 dark:text-brand-400' : 'text-ink-soft',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
