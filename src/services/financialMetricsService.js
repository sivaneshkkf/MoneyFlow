import { supabase } from '../lib/supabaseClient'

/**
 * Single source of truth for financial position metrics. Both the Dashboard and
 * the Accounts page read from here so their numbers always agree.
 *
 * Definitions:
 *  - availableBalance  = Σ current_balance of active NON credit-card accounts
 *                        (bank + cash + UPI + digital wallet + debit card)
 *  - creditCardDebt    = Σ metadata.current_outstanding of active credit cards
 *  - receivable        = outstanding principal + interest on live lending records
 *  - netWorth          = availableBalance + receivable − creditCardDebt
 *  - savings           = income − expenses  (money lent is NOT subtracted)
 *  - cashFlow          = income − expenses − moneyLent + principal + interest
 */
export async function fetchFinancialSummary() {
  const { data, error } = await supabase.rpc('get_financial_summary')
  if (error) throw error
  const r = data?.[0] ?? {}
  const availableBalance = Number(r.available_balance ?? 0)
  const creditCardDebt = Number(r.credit_card_debt ?? 0)
  const receivable = Number(r.receivable_outstanding ?? 0)

  return {
    availableBalance,
    bankBalance: Number(r.bank_balance ?? 0),
    cashBalance: Number(r.cash_balance ?? 0),
    walletBalance: Number(r.wallet_balance ?? 0),
    otherAssetBalance: Number(r.other_asset_balance ?? 0),
    creditCardDebt,
    creditLimit: Number(r.credit_limit ?? 0),
    availableCredit: Number(r.available_credit ?? 0),
    creditUtilization: Number(r.credit_utilization ?? 0),
    moneyLent: Number(r.money_lent ?? 0),
    receivable,
    principalReceived: Number(r.principal_received ?? 0),
    interestReceived: Number(r.interest_received ?? 0),
    overdue: Number(r.overdue_amount ?? 0),
    borrowerCount: Number(r.borrower_count ?? 0),
    loanLiabilities: Number(r.loan_liabilities ?? 0),
    netWorth: Number(
      r.net_worth ?? availableBalance + receivable - creditCardDebt - Number(r.loan_liabilities ?? 0),
    ),
  }
}

export async function fetchMonthlySummary(year, month) {
  const { data, error } = await supabase.rpc('get_monthly_financial_summary', {
    p_year: year,
    p_month: month,
  })
  if (error) throw error
  const r = data?.[0] ?? {}
  return {
    income: Number(r.income ?? 0),
    expenses: Number(r.expenses ?? 0),
    moneyLent: Number(r.money_lent ?? 0),
    principalReceived: Number(r.principal_received ?? 0),
    interestReceived: Number(r.interest_received ?? 0),
    netSavings: Number(r.net_operating_savings ?? 0),
    cashFlow: Number(r.cash_flow ?? 0),
    savingsRate: Number(r.savings_rate ?? 0),
    loanPrincipalPaid: Number(r.loan_principal_paid ?? 0),
  }
}
