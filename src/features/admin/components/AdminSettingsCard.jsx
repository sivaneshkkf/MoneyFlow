/**
 * Shared card shell for the Admin Settings page — every section is built
 * from a handful of these instead of one giant catch-all card. Height is
 * always content-driven (no forced min-height), matching the rest of the
 * Admin Console's card style.
 */
export default function AdminSettingsCard({ icon: Icon, title, description, action, children, className = '' }) {
  return (
    <div className={`card p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
              <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-bold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-soft">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
