import { format, subDays, subMonths } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'

const d = (x) => format(x, 'yyyy-MM-dd')

/**
 * DEV-ONLY demo data seeder. Adds realistic sample records to the CURRENT user's
 * account. Never call this in production or against a real dataset — it is wired
 * only behind an `import.meta.env.DEV` guard in Settings → Preferences.
 */
export async function seedDemoData() {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) throw new Error('Not signed in')

  await supabase.rpc('ensure_user_setup')

  // Account
  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      name: 'Demo Bank',
      type: 'Bank Account',
      opening_balance: 25000,
      current_balance: 25000,
    })
    .select()
    .single()
  if (accErr) throw accErr

  const { data: cats } = await supabase.from('categories').select('id,name,type')
  const cat = (name, type) => cats?.find((c) => c.name === name && c.type === type)?.id ?? null

  const now = new Date()
  const tx = [
    { type: 'income', amount: 50000, description: 'Monthly salary', category: cat('Salary', 'income'), date: d(subDays(now, 20)) },
    { type: 'income', amount: 8000, description: 'Freelance project', category: cat('Freelance', 'income'), date: d(subDays(now, 12)) },
    { type: 'expense', amount: 12000, description: 'House rent', category: cat('Housing', 'expense'), date: d(subDays(now, 19)) },
    { type: 'expense', amount: 5500, description: 'Groceries', category: cat('Food', 'expense'), date: d(subDays(now, 15)) },
    { type: 'expense', amount: 3000, description: 'Fuel & cab', category: cat('Transportation', 'expense'), date: d(subDays(now, 10)) },
    { type: 'expense', amount: 4000, description: 'New headphones', category: cat('Shopping', 'expense'), date: d(subDays(now, 8)) },
    { type: 'expense', amount: 3000, description: 'Electricity + internet', category: cat('Bills', 'expense'), date: d(subDays(now, 6)) },
    { type: 'expense', amount: 1200, description: 'Movie night', category: cat('Entertainment', 'expense'), date: d(subDays(now, 3)) },
  ]
  await supabase.from('transactions').insert(
    tx.map((t) => ({
      user_id: userId,
      account_id: account.id,
      category_id: t.category,
      type: t.type,
      amount: t.amount,
      description: t.description,
      transaction_date: t.date,
      source: 'manual',
    })),
  )

  // Budgets for current month
  await supabase.from('budgets').insert(
    [
      ['Food', 6000],
      ['Housing', 12000],
      ['Shopping', 3000],
      // Kept to 3 categories: the Free plan's monthly budget limit.
    ]
      .map(([name, amount]) => ({
        user_id: userId,
        category_id: cat(name, 'expense'),
        amount,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      }))
      .filter((b) => b.category_id),
  )

  // Savings goal
  const { data: goal } = await supabase
    .from('savings_goals')
    .insert({
      user_id: userId,
      name: 'New Laptop',
      target_amount: 80000,
      current_amount: 0,
      category: 'New Laptop',
      target_date: d(subMonths(now, -4)),
    })
    .select()
    .single()
  if (goal) {
    await supabase.from('goal_contributions').insert({
      goal_id: goal.id,
      user_id: userId,
      amount: 30000,
      contribution_date: d(subDays(now, 25)),
    })
  }

  // Lending — one healthy, one overdue
  const { data: lend1 } = await supabase
    .from('lending_records')
    .insert({
      user_id: userId,
      borrower_name: 'Rahul Kumar',
      phone: '+91 90000 11111',
      principal_amount: 20000,
      interest_type: 'none',
      lending_date: d(subDays(now, 40)),
      due_date: d(subMonths(now, -1)),
      account_id: account.id,
      purpose: 'Short-term help',
    })
    .select()
    .single()
  if (lend1) {
    await supabase.rpc('record_lending_repayment', {
      p_lending_record_id: lend1.id,
      p_amount: 12000,
      p_principal: 12000,
      p_interest: 0,
      p_payment_date: d(subDays(now, 10)),
      p_account_id: account.id,
      p_payment_method_id: null,
      p_notes: 'Partial repayment',
      p_attachment_url: null,
    })
  }

  await supabase.from('lending_records').insert({
    user_id: userId,
    borrower_name: 'Arun',
    phone: '+91 90000 22222',
    principal_amount: 15000,
    interest_type: 'percentage',
    interest_rate: 5,
    lending_date: d(subDays(now, 90)),
    due_date: d(subDays(now, 20)),
    account_id: account.id,
    purpose: 'Business inventory',
  })

  return { ok: true }
}
