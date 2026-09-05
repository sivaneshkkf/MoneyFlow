# MoneyFlow

**Take control of your money.**

A production-style personal finance SaaS: income & expense tracking, accounts,
budgets, savings goals, analytics, monthly reports, and a full **personal lending**
module with correct cash-vs-receivable accounting.

Built with React 19 · Vite · JavaScript/JSX · Tailwind CSS · Supabase (Postgres, Auth,
Storage, Realtime) · TanStack Query · React Hook Form + Zod · Recharts · date-fns ·
lucide-react.

---

## 1. Project structure

```
src/
  components/
    common/     Logo, Modal, ConfirmDialog, Pagination, ToastProvider, ErrorBoundary,
                form primitives, StatCard/Badge/EmptyState/Skeleton/ProgressBar (index.jsx)
    layout/     AppLayout, Sidebar, Header, MobileNavigation, navConfig
  features/
    auth/       AuthProvider, ProtectedRoute, AuthShell, Login/Register/Forgot/Reset, GoogleButton
    dashboard/  DashboardPage, useDashboard, widgets/*
    transactions/ useTransactions, useTypeSummary, TransactionForm, TransactionsView
    income/ expenses/     thin wrappers over TransactionsView + TypeSummaryStrip
    accounts/   useAccounts, AccountForm, AccountsPage
    budgets/    useBudgets, BudgetForm, BudgetsPage
    goals/      useGoals, GoalForm, ContributionForm, GoalsPage
    lending/    useLending, status, LendingForm, RepaymentForm,
                LendingGivenPage, LendingReceivedPage, LendingDetailPage
    analytics/  useAnalytics, AnalyticsPage
    reports/    useReport, ReportsPage
    categories/ useCategories
    settings/   SettingsLayout, Profile/Preferences/Categories/PaymentMethods/Security,
                ThemeProvider, useProfile, usePaymentMethods
    command/    QuickActionsProvider, CommandPalette, useGlobalSearch
    realtime/   RealtimeSync
    dev/        seedDemoData (DEV only)
  lib/          supabaseClient.js
  utils/        format.js, errors.js, csv.js, health.js
  constants/    index.js
  routes/       AppRoutes.jsx
supabase/migrations/   001 … 014 (see below)
public/       sw.js, manifest.webmanifest, favicon.svg
```

## 2. Installed packages

Runtime: `react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`,
`@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod`, `recharts`,
`lucide-react`, `date-fns`, `clsx`.

Dev: `vite`, `@vitejs/plugin-react`, `tailwindcss@3`, `postcss`, `autoprefixer`, `oxlint`.

## 3. Environment variables

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon / publishable key>
```

`.env` is git-ignored. The `service_role` key is **never** used in the frontend.

## 4. Supabase setup

1. Create a project at supabase.com.
2. **SQL migrations** — open the SQL editor and run the files in
   `supabase/migrations/` **in numerical order** (`001` → `014`), or with the CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. **Storage** — `012_storage.sql` creates private buckets `avatars`, `attachments`,
   `lending-documents`, each with a policy limiting access to `"<uid>/…"` paths.
4. **Realtime** — `014_realtime.sql` adds `transactions`, `lending_records`,
   `lending_repayments`, `alerts` to the `supabase_realtime` publication. RLS still
   filters the stream per user.

### Migration files

| File | Purpose |
| --- | --- |
| 001 | `profiles` + `handle_new_user` trigger |
| 002 | `accounts` |
| 003 | `categories`, `payment_methods`, `seed_user_defaults()` |
| 004 | `transactions`, `recurring_transactions`, account-balance trigger |
| 005 | `budgets` |
| 006 | `savings_goals`, `goal_contributions` + trigger |
| 007 | `lending_records` + recalc & cash-out triggers |
| 008 | `lending_repayments`, `alerts`, `attachments`, **`record_lending_repayment()`** |
| 009 | indexes |
| 010 | `get_monthly_financial_summary`, `get_lending_summary`, `get_category_expense_summary`, `recalculate_account_balance`, views |
| 011 | **RLS** — owner-only policies on every user table + `ensure_user_setup()` |
| 012 | storage buckets + policies |
| 013 | `delete_lending_repayment()` — atomic reversal |
| 014 | realtime publication |

## 5. RLS policy explanation

Every user-owned table has RLS **enabled** with four policies:

```sql
select  using (user_id = auth.uid())
insert  with check (user_id = auth.uid())
update  using (user_id = auth.uid()) with check (user_id = auth.uid())
delete  using (user_id = auth.uid())
```

`profiles` uses `id = auth.uid()`. A frontend-supplied `user_id` is never trusted —
ownership is enforced by the database. `SECURITY DEFINER` functions all re-check
`auth.uid()` internally. Views (`borrower_summary`, `account_balance_summary`) run with
`security_invoker = on` so RLS applies through them.

## 6. Authentication setup

- Supabase → Authentication → Providers → **Email** enabled (Confirm email recommended).
- Auth → URL configuration → add `http://localhost:5173` and your production origin.
- A `profiles` row is auto-created by the `handle_new_user` trigger; `ensure_user_setup()`
  (called on `SIGNED_IN`) also seeds default income/expense categories and payment methods.

## 7. Google OAuth setup

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID** (Web).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Providers → **Google** → paste Client ID + Secret.
4. The app calls `signInWithOAuth({ provider: 'google', redirectTo: <origin>/dashboard })`.

## 8. Local development

```bash
npm install
npm run dev       # http://localhost:5173
npm run lint      # oxlint
npm run build
npm run preview
```

Dev-only demo data: **Settings → Preferences → Seed demo data** (guarded by
`import.meta.env.DEV`).

## 9. Production build & deployment

```bash
npm run build     # outputs dist/
```

Deploy `dist/` as a static site (Vercel, Netlify, Cloudflare Pages, Supabase Hosting…).
SPA fallback: rewrite all paths to `/index.html`. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in the host's env. Add the deployed origin to Supabase
Auth URL configuration and the Google OAuth redirect list. The service worker
(`/sw.js`) registers automatically in production and caches only the static shell.

## 10. Feature list

- Email/password + Google auth, email verification, forgot/reset password, protected routes
- Accounts (bank/cash/UPI/cards/wallets) with live balances and history-based recalc
- Categories & payment methods (defaults seeded, custom CRUD)
- Transactions: CRUD, search, filter (type/category/account/date/amount), sort, pagination, CSV
- Dedicated Income & Expenses pages with 12-month trend + category breakdown
- Budgets: monthly, per-category progress vs real spend, healthy/near-limit/critical/exceeded
- Savings goals: CRUD, add/withdraw contributions, archive, contribution history
- **Lending**: records with interest (none/fixed/%/simple), borrower roll-up, partial
  repayments with principal/interest allocation, overdue detection, lending vs recovery
  charts, detail page with repayment timeline, Money Received view, CSV export
- Dashboard: 6 metric cards, cash-flow chart (area/line, range filters), spending donut +
  weekday heatmap, financial health score, lending overview, goals, recent transactions,
  upcoming repayments, "Where did my money go?", rule-based insights
- Analytics page with custom date ranges; monthly Reports with CSV + print
- Command palette (⌘K) + grouped global search
- Light / dark / system themes, responsive (320 → 1920), PWA installable
- Toasts, skeletons, empty states, error states, confirm dialogs, accessible modals

## 11. Known limitations

- Attachment upload UI (lending documents / receipts) is not yet wired to the storage
  buckets, though buckets + policies exist.
- Reports "PDF" = browser Print → Save as PDF (no bundled PDF lib).
- Recurring transactions have a table but no scheduler/runner yet.
- Alerts table exists; in-app reminders are currently derived live on the dashboard
  rather than persisted rows.
- Service worker caches the shell only — the app needs a connection for data.

## 12. Future enhancements

- Edge Function / cron to materialise recurring transactions and lending reminders
- Attachment uploads + previews
- Multi-currency, shared/household budgets
- Bank statement import (CSV/OFX) with category auto-tagging
- Native PDF export for reports
```
