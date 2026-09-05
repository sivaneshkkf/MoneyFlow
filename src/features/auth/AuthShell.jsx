import { Link } from 'react-router-dom'
import { LineChart, Target, ShieldCheck, Moon, Sun, Laptop } from 'lucide-react'
import Logo from '../../components/common/Logo'
import { useTheme } from '../settings/ThemeProvider'

const HERO_IMG = '/loginPageImg.png'

const FEATURES = [
  {
    icon: LineChart,
    title: 'Complete financial overview',
    body: 'See where your money comes from and where it goes.',
  },
  {
    icon: Target,
    title: 'Smart budgets & goals',
    body: 'Plan better, save more and achieve what matters.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure & private',
    body: 'Your data is encrypted and always protected.',
  },
]

function HeroArt() {
  return (
    <img
      src={HERO_IMG}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 right-0 w-[min(72%,520px)] select-none object-contain"
    />
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next = { light: 'dark', dark: 'system', system: 'light' }
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop
  return (
    <button
      onClick={() => setTheme(next[theme])}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:text-ink dark:border-white/10 dark:bg-white/5"
    >
      <Icon className="h-4 w-4" />
      Theme
    </button>
  )
}

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,44%)_1fr]">
      {/* --- left marketing panel --- */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0C1E1A] via-dark to-[#123A32] p-10 text-white lg:flex xl:p-14">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.16), transparent 70%)' }}
        />
        <div className="relative">
          <Link to="/" className="flex items-center gap-3">
            <Logo className="h-11 w-11" />
            <span>
              <span className="block text-lg font-extrabold leading-none">MoneyFlow</span>
              <span className="block text-xs text-white/55">Your money, your flow.</span>
            </span>
          </Link>

          <h2 className="mt-12 max-w-md text-4xl font-extrabold leading-[1.1] xl:text-[2.7rem]">
            Take control of your{' '}
            <span className="relative text-[#6EE7A8]">
              money.
              <svg className="absolute -bottom-1 left-0 w-full" height="6" viewBox="0 0 120 6" preserveAspectRatio="none" aria-hidden="true">
                <path d="M1 4 Q 40 0 119 3" fill="none" stroke="#6EE7A8" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">
            Track income, expenses, budgets, savings goals and personal lending — with clear,
            trustworthy accounting for every rupee.
          </p>

          <ul className="mt-9 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#6EE7A8]">
                  <f.icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                </span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="mt-0.5 max-w-[15rem] text-xs leading-relaxed text-white/55">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <HeroArt />
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} MoneyFlow. All rights reserved.</p>
      </div>

      {/* --- right form panel --- */}
      <div className="relative flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="absolute right-5 top-5 sm:right-8 sm:top-8">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[26rem]">
          <div className="mb-8 lg:hidden">
            <Logo withText />
          </div>
          {(title || subtitle) && (
            <div className="text-center">
              {title && <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>}
              {subtitle && <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>}
            </div>
          )}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-ink-soft">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
