-- 009_create_indexes.sql
create index if not exists idx_tx_user_date on public.transactions (user_id, transaction_date desc);
create index if not exists idx_tx_user_type on public.transactions (user_id, type);
create index if not exists idx_tx_user_category on public.transactions (user_id, category_id);
create index if not exists idx_tx_user_account on public.transactions (user_id, account_id);

create index if not exists idx_budgets_user_period on public.budgets (user_id, year, month);
create index if not exists idx_categories_user_type on public.categories (user_id, type);
create index if not exists idx_accounts_user on public.accounts (user_id, is_active);

create index if not exists idx_lending_user_status on public.lending_records (user_id, status);
create index if not exists idx_lending_user_due on public.lending_records (user_id, due_date);
create index if not exists idx_repayments_record_date on public.lending_repayments (lending_record_id, payment_date desc);
create index if not exists idx_repayments_user on public.lending_repayments (user_id, payment_date desc);

create index if not exists idx_goal_contrib_goal on public.goal_contributions (goal_id, contribution_date desc);
create index if not exists idx_alerts_user_read on public.alerts (user_id, is_read, created_at desc);
