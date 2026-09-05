# MoneyFlow — Implementation Plan & Progress

> _Take control of your money._ — A premium personal finance, budgeting, savings and
> personal-lending SaaS built with React + Vite + Supabase.

---

## 1. Current project analysis

| Item | State |
| --- | --- |
| Starting point | Empty directory — no prior code to preserve |
| Scaffold | `npm create vite` (React 19 + Vite 8, JavaScript/JSX) |
| Styling | Tailwind CSS v3 + custom MoneyFlow design tokens |
| Data layer | Supabase (Postgres, Auth, Storage, Realtime) |
| State/data fetching | TanStack Query |
| Forms/validation | React Hook Form + Zod |
| Charts / icons / dates | Recharts · lucide-react · date-fns |

No TypeScript migration — the project stays JS/JSX per the brief.

---

## 2. Architecture plan

```
src/
  components/
    common/      StatCard, Badge, EmptyState, Skeleton, ProgressBar, Toast, Logo …
    layout/      AppLayout, Sidebar, Header, MobileNavigation, navConfig
  features/
    auth/        AuthProvider, ProtectedRoute, Login/Register/Forgot/Reset, GoogleButton
    dashboard/   DashboardPage + widgets
    transactions/ income/ expenses/ accounts/ budgets/ goals/
    lending/     given, received, detail, repayments, analytics
    analytics/ reports/ settings/
  lib/           supabaseClient.js
  hooks/         cross-feature hooks
  services/      thin Supabase query wrappers
  utils/         format.js (INR + date-fns helpers)
  constants/     categories, account types, statuses, date ranges
  routes/        AppRoutes.jsx (lazy-loaded, protected)
  pages/         Placeholder.jsx (phased routes)
```

**Providers** (`App.jsx`): `QueryClientProvider → BrowserRouter → ThemeProvider →
ToastProvider → AuthProvider → AppRoutes`.

**Design tokens** (`tailwind.config.js`): `bg #F5F7F6`, `dark #172321`, `brand.700 #315C54`,
`brand.600 #2F6F63`, `line #E4E9E7`, semantic success/warning/danger/info. Dark mode via
`class` strategy with a hand-tuned palette (not an inversion).

---

## 3. Database plan (`supabase/migrations/`)

| File | Contents |
| --- | --- |
| `001_create_profiles.sql` | `profiles` + `handle_new_user` trigger on `auth.users` |
| `002_create_accounts.sql` | `accounts` (opening/current balance, type, institution) |
| `003_create_categories.sql` | `categories`, `payment_methods`, `seed_user_defaults()` |
| `004_create_transactions.sql` | `transactions`, `recurring_transactions`, balance trigger |
| `005_create_budgets.sql` | `budgets` (unique per category/month/year) |
| `006_create_goals.sql` | `savings_goals`, `goal_contributions` + trigger |
| `007_create_lending.sql` | `lending_records`, recalc trigger, cash-out trigger |
| `008_create_repayments.sql` | `lending_repayments`, `alerts`, `attachments`, **`record_lending_repayment()`** (atomic) |
| `009_create_indexes.sql` | All indexes from spec §90 |
| `010_create_functions.sql` | `get_monthly_financial_summary`, `get_lending_summary`, `get_category_expense_summary`, `recalculate_account_balance`, views |
| `011_create_rls.sql` | RLS enabled + owner-only policies on every user table, `ensure_user_setup()` |
| `012_storage.sql` | `avatars` / `attachments` / `lending-documents` buckets + per-user folder policies |
| `013_lending_repayment_delete.sql` | `delete_lending_repayment()` — atomic reversal of a repayment |
| `014_realtime.sql` | realtime publication |
| `015_grants.sql` | base table/function GRANTs for `anon` / `authenticated` |
| `016_account_metadata.sql` | `accounts.metadata` JSONB (card network, expiry, IFSC, UPI id, credit limit/outstanding, theme…) |
| `017_financial_summary.sql` | `account_financial_type()` / `is_available_cash_account()`, **`get_financial_summary()`** (single source of truth: available balance excl. credit cards, credit-card debt, net worth, available credit, utilization, receivables), credit-card guard in `apply_transaction_balance` + `recalculate_account_balance`, interest double-count fix in `get_monthly_financial_summary`, idempotency token on `record_lending_repayment` |
| `018_lending_installment_schedule.sql` | `lending_installments` + `lending_repayment_allocations` (RLS), `generate_lending_schedule()` (integer-paise split, no float), allocation loop in `record_lending_repayment` (oldest-outstanding-first), full reversal in `delete_lending_repayment`, `recompute_lending_from_installments()`, `refresh_lending_schedule_status()`, `update_installment_due_date()`; **schedule-aware overdue** — `lending_records.overdue_amount / overdue_installments / next_due_date` drive summaries instead of `today − loan.due_date` |

### Core financial rules encoded in the DB

- **Money lent is not an expense** — it moves cash → receivable. `lending_cash_out`
  trigger debits the account by principal; it is never written as a transaction.
- **Principal repayment is not income** — `record_lending_repayment` credits cash and
  reduces `outstanding_principal` only.
- **Interest received is income and cash** — the RPC credits the account once (full
  repayment amount) and inserts one `income` transaction (`source = 'lending_interest'`,
  `account_id = null`) so the balance is never double-counted.
- **No negative outstanding** — the RPC rejects principal/interest above outstanding.
- Monthly summary keeps Income / Expenses / Money Lent / Principal Received /
  Interest Received / Outstanding as **separate** figures (spec §93–94).

---

## 4. UI plan

- **Auth**: split-screen premium shell — dark green gradient panel + form.
- **Dashboard**: dark hero (`Hey, {firstName}`), 6 metric cards, Cash Flow area chart,
  Financial Health, Spending Breakdown (donut + GitHub-style heatmap), Lending Overview,
  Savings Goals, Recent Transactions, Upcoming Repayments, Insights.
- **Lists**: `DataTable` on desktop → `MobileCard` on mobile; `FilterBar`, `SearchInput`,
  `DateRangePicker`, `Pagination`.
- **Lending**: dedicated dashboard, borrower list/profile, lending detail with repayment
  timeline, overdue + upcoming widgets.
- **Global**: command palette (Ctrl/⌘-K), global search, toasts, skeletons, empty/error
  states, confirm dialogs, light/dark/system theme, PWA manifest.
- Currency always `Intl.NumberFormat('en-IN')`; dates via date-fns.

---

## 5. Implementation phases

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Scaffold, Tailwind + tokens, Supabase client, routing, layout (sidebar/header/mobile nav), theme, **auth** (email+password, Google, forgot/reset, protected routes, profile bootstrap) | ✅ **Done** |
| **2** | All SQL migrations, RLS, indexes, functions, storage buckets | ✅ **Done** (files written — run against your Supabase project) |
| **3** | Transactions / Income / Expenses / Accounts / Categories / Payment methods CRUD + query hooks, filters, CSV export, Settings shell (profile, preferences, security) | ✅ **Done** |
| **4** | Dashboard live data: 6 metric cards, cash-flow area/line chart w/ range filters, spending donut + weekday heatmap, financial health score, lending overview, savings goals, recent transactions, upcoming repayments, "Where did my money go?", rule-based insights | ✅ **Done** |
| **5** | Budgets (month navigator, per-category progress vs live spend, healthy/near-limit/critical/exceeded status) · Savings Goals (CRUD, add/withdraw contributions w/ validation, archive/restore, history) | ✅ **Done** |
| **6** | **Lending** — record CRUD (borrower details, interest none/fixed/%/simple, due dates), borrower roll-up table + mobile cards, atomic repayments via `record_lending_repayment` RPC (principal/interest allocation, partial, "pay full", no negative outstanding), `delete_lending_repayment` RPC reversal, overdue detection + days-overdue, lending-vs-recovery chart, detail page w/ repayment timeline, write-off, Money Received view, CSV export | ✅ **Done** |
| **7** | Analytics page (headline cards + savings rate, cash-flow area, expense donut, income bar, savings bars, lending line, recovery cards, financial-health panel; 7d/30d/3m/6m/12m + custom range) · monthly Reports (RPC-driven summary keeping each concept separate, expense breakdown, CSV export, print-friendly with `no-print` chrome) | ✅ **Done** |
| **8** | Command palette (⌘/Ctrl-K, `open-command-palette` event, quick actions via `QuickActionsProvider` + grouped global search across transactions/lending/accounts/categories/goals) · header search button · service worker (app-shell only, never caches Supabase data) registered in prod · dark-mode heatmap token fix | ✅ **Done** |
| **9** | `ErrorBoundary` around the app, Modal focus-trap + focus-restore, `RealtimeSync` (selective per-user channel, migration 014), DEV-only `seedDemoData`, README with full deliverables + RLS test checklist, lazy routes verified, production build clean | ✅ **Done** |

---

## 6. Setup instructions

### Environment

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon / publishable key>
```

Never commit `.env`; never put the `service_role` key in the frontend.

### Database

Run the migrations in order in the Supabase SQL editor (or `supabase db push`
with the CLI):

```
supabase/migrations/001_… → 014_realtime.sql
```

> Full deliverables (packages, Google OAuth, deployment, feature list, limitations,
> future work) live in **[README.md](README.md)**.

### Auth

1. Supabase → Authentication → Providers → enable **Email** (with "Confirm email" as
   preferred).
2. Enable **Google**: create an OAuth client in Google Cloud Console, add
   `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI,
   paste client id/secret into Supabase.
3. Auth → URL configuration → add `http://localhost:5173` and your production URL to
   redirect allow-list.

### Storage

Buckets `avatars`, `attachments`, `lending-documents` are created by `012_storage.sql`
as **private**, each with a policy restricting access to `"<uid>/…"` paths.

### Local development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build
npm run preview
```

---

## 7. Known limitations (current build)

- Service worker caches only the static app shell; all data is fetched live from
  Supabase, so the app is not usable fully offline (by design, per spec §88).
- `013_lending_repayment_delete.sql` must be run alongside the other migrations
  (adds the `delete_lending_repayment` reversal function).
- Reports PDF export is via the browser Print dialog ("Save as PDF"); no bundled
  PDF library.
- Dashboard is fully live (metrics via `get_monthly_financial_summary` /
  `get_lending_summary` RPCs); lending widgets read zero until Phase 6 adds records.
- No offline data sync (PWA is install + shell only, per spec §88).

## 7b. RLS test checklist

Run as two separate users (A and B). Every check must **fail for B**:

- [ ] `select * from transactions` returns only the caller's rows
- [ ] B `update transactions set amount = 1 where user_id = A` → 0 rows / error
- [ ] B `insert into transactions (user_id, …) values (A, …)` → rejected by `with check`
- [ ] B `select * from lending_records` / `lending_repayments` → only B's rows
- [ ] B calls `record_lending_repayment` with A's `lending_record_id` → "Lending record not found"
- [ ] B calls `delete_lending_repayment` with A's repayment id → "Repayment not found"
- [ ] B `select * from budgets / savings_goals / goal_contributions / accounts` → only B's
- [ ] Storage: B `GET` on `attachments/<A-uid>/file.pdf` → 403
- [ ] `get_monthly_financial_summary` / `get_lending_summary` return only caller's figures
- [ ] Realtime channel `user-sync-<A>` delivers no rows to B

## 8. Future enhancements

- Recurring-transaction runner (Edge Function / cron).
- Multi-currency support.
- Shared/household budgets.
- Bank statement import (CSV/OFX) with category auto-tagging.
