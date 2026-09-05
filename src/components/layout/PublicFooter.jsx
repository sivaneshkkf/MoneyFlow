import { Link } from 'react-router-dom'
import Logo from '../common/Logo'
import { BUSINESS_INFO, isConfigured } from '../../config/businessConfig'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { to: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Company',
    links: [{ to: '/contact', label: 'Contact' }],
  },
  {
    title: 'Legal',
    links: [
      { to: '/terms', label: 'Terms & Conditions' },
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/refund-policy', label: 'Cancellation & Refund Policy' },
    ],
  },
  {
    title: 'Support',
    links: [{ to: '/contact', label: 'Contact Us' }],
  },
]

export default function PublicFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-line bg-white dark:border-white/10 dark:bg-[#131B19]">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo withText />
            <p className="mt-3 max-w-xs text-sm text-ink-soft">
              Take control of your money with simple, clear financial tracking.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm text-ink-soft transition hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-ink-soft sm:flex-row dark:border-white/10">
          <p>
            © {year} {isConfigured(BUSINESS_INFO.legalName) ? BUSINESS_INFO.legalName : BUSINESS_INFO.brandName}. All rights reserved.
          </p>
          <p>Payments powered by Razorpay</p>
        </div>
      </div>
    </footer>
  )
}
