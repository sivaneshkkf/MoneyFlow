import clsx from "clsx";
import { TrendingDown, TrendingUp, Info } from "lucide-react";
import { formatPercent } from "../../utils/format";

export function PageContainer({ title, subtitle, action, children }) {
  return (
    <div className="relative mx-auto w-full max-w-7xl py-6">
      {(title || action) && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            {title && (
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function SectionHeader({ title, action }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-base font-semibold">{title}</h2>
      {action}
    </div>
  );
}

const tones = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  neutral: "bg-brand-400/15 text-brand-700 dark:text-brand-400",
};

export function Badge({ tone = "neutral", children }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function TrendIndicator({ value }) {
  const positive = Number(value) >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-xs font-semibold",
        positive ? "text-success" : "text-danger",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {formatPercent(value)}
    </span>
  );
}

export function StatCard({
  title,
  amount,
  change,
  comparison = "vs last month",
  icon: Icon,
  hint,
  tone = "neutral",
  info,
}) {
  const iconTone =
    tone === "danger"
      ? "bg-danger/10 text-danger"
      : tone === "success"
        ? "bg-success/10 text-success"
        : "bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400";
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm text-ink-soft">
          {title}
          {info && <InfoDot text={info} />}
        </span>
        {Icon && (
          <span className={clsx("rounded-lg p-1.5", iconTone)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div
        className={clsx(
          "mt-2 text-2xl font-bold tracking-tight",
          tone === "danger" && "text-danger",
        )}
      >
        {amount}
      </div>
      {change !== undefined && change !== null ? (
        <div className="mt-1 flex items-center gap-2">
          <TrendIndicator value={change} />
          <span className="text-xs text-ink-soft">{comparison}</span>
        </div>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}

export function InfoDot({ text }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3.5 w-3.5 cursor-help text-ink-soft/70" />
      <span className="pointer-events-none absolute left-1/2 top-5 z-30 w-52 -translate-x-1/2 rounded-lg bg-dark px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <span className="mb-3 rounded-2xl bg-brand-50 p-3 text-brand-700 dark:bg-white/5 dark:text-brand-400">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong. Please try again.",
  onRetry,
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <button className="btn-ghost mt-4" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded-xl bg-brand-400/15 dark:bg-white/5",
        className,
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="card space-y-3 p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function ProgressBar({ value = 0, tone = "neutral" }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-brand-600",
  }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-brand-400/15 dark:bg-white/10">
      <div
        className={clsx("h-full rounded-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
