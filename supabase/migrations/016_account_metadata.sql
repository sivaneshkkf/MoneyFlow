-- 016_account_metadata.sql
-- Extra, non-sensitive account details for the redesigned Accounts page:
-- card network, expiry month/year, IFSC, UPI id / wallet identifier,
-- account subtype (savings/current/salary), credit limit + outstanding, notes,
-- optional bank logo url, and a card theme override. Kept in one JSONB column
-- so no schema churn and existing transaction logic is untouched.
alter table public.accounts
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Never store: full card number, CVV, PIN, OTP, banking passwords.
comment on column public.accounts.metadata is
  'Non-sensitive display details only: {network, expiry_month, expiry_year, ifsc, upi_id, identifier, subtype, credit_limit, current_outstanding, notes, bank_logo_url, theme}';
