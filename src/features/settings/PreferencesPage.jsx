import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sun, Moon, Monitor, Check, Database, Info } from 'lucide-react'
import clsx from 'clsx'
import { useTheme } from './ThemeProvider'
import { useToast } from '../../components/common/ToastProvider'
import { seedDemoData } from '../dev/seedDemoData'
import { friendlyError } from '../../utils/errors'

const OPTIONS = [
  { key: 'light', label: 'Light', desc: 'Clean and bright', icon: Sun },
  { key: 'dark', label: 'Dark', desc: 'Easy on your eyes', icon: Moon },
  { key: 'system', label: 'System', desc: 'Follow device setting', icon: Monitor },
]

const PREVIEW_POINTS = ['Clean interface', 'Better readability', 'Modern look', 'Optimized for productivity']

export default function PreferencesPage() {
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const qc = useQueryClient()
  const [seeding, setSeeding] = useState(false)

  const runSeed = async () => {
    setSeeding(true)
    try {
      await seedDemoData()
      await qc.invalidateQueries()
      toast.success('Demo data added.')
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to seed demo data.'))
    } finally {
      setSeeding(false)
    }
  }

  const activeLabel = OPTIONS.find((o) => o.key === theme)?.label ?? 'Light'

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        {/* appearance */}
        <div className="card p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-success/12 text-success">
              <Sun className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold">Appearance</h2>
              <p className="text-xs text-ink-soft">Choose how MoneyFlow looks on this device.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {OPTIONS.map((o) => {
              const active = theme === o.key
              return (
                <button
                  key={o.key}
                  onClick={() => setTheme(o.key)}
                  className={clsx(
                    'relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition',
                    active
                      ? 'border-success/60 bg-success/[0.07] ring-1 ring-success/40'
                      : 'border-line hover:bg-brand-50 dark:border-white/10 dark:hover:bg-white/5',
                  )}
                >
                  {active && (
                    <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-success text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                  <span
                    className={clsx(
                      'grid h-11 w-11 place-items-center rounded-full',
                      active ? 'bg-dark text-white' : 'bg-brand-400/15 text-ink-soft',
                    )}
                  >
                    <o.icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-bold">{o.label}</span>
                  <span className="text-xs text-ink-soft">{o.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* developer */}
        {import.meta.env.DEV && (
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-success/12 text-success">
                <Database className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold">Developer — demo data</h2>
            </div>
            <p className="text-sm text-ink-soft">
              Adds a sample account, transactions, budgets, a savings goal and two lending records to your
              current account. Visible in development builds only.
            </p>

            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/[0.07] p-3 text-xs dark:bg-warning/10">
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-warning text-white">
                <Info className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              <span>
                <b className="text-warning">Development only</b>
                <br />
                This will add sample data to help you explore the app&apos;s features.
              </span>
            </div>

            <button className="btn-primary mt-4" onClick={runSeed} disabled={seeding}>
              <Database className="h-4 w-4" />
              {seeding ? 'Seeding…' : 'Seed demo data'}
            </button>
          </div>
        )}
      </div>

      {/* preview */}
      <div className="relative overflow-hidden rounded-2xl border border-success/20 bg-gradient-to-br from-success/[0.10] via-success/[0.04] to-white p-6 dark:to-[#161F1D]">
        <img
          src="/preferenceImg.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-2 top-6 hidden w-48 select-none object-contain sm:block"
        />
        <div className="relative">
          <h3 className="text-base font-bold">Preview</h3>
          <p className="text-xs text-ink-soft">
            This is how the app looks in {theme === 'system' ? 'System (device) mode' : `${activeLabel} mode`}.
          </p>
          <ul className="mt-6 space-y-3">
            {PREVIEW_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success text-white">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
