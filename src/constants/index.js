export const CURRENCY = 'INR'
export const LOCALE = 'en-IN'

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Housing', color: '#315C54', icon: 'Home' },
  { name: 'Food', color: '#2F6F63', icon: 'Utensils' },
  { name: 'Transportation', color: '#3B82F6', icon: 'Car' },
  { name: 'Bills', color: '#F59E0B', icon: 'ReceiptText' },
  { name: 'Shopping', color: '#8B5CF6', icon: 'ShoppingBag' },
  { name: 'Entertainment', color: '#EC4899', icon: 'Clapperboard' },
  { name: 'Healthcare', color: '#EF4444', icon: 'HeartPulse' },
  { name: 'Education', color: '#0EA5E9', icon: 'GraduationCap' },
  { name: 'Other', color: '#7C9B95', icon: 'Boxes' },
]

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', color: '#22C55E', icon: 'Wallet' },
  { name: 'Freelance', color: '#2F6F63', icon: 'Laptop' },
  { name: 'Business', color: '#315C54', icon: 'Briefcase' },
  { name: 'Bonus', color: '#F59E0B', icon: 'Gift' },
  { name: 'Investment', color: '#3B82F6', icon: 'TrendingUp' },
  { name: 'Rental', color: '#8B5CF6', icon: 'Building2' },
  { name: 'Interest', color: '#0EA5E9', icon: 'Percent' },
  { name: 'Other', color: '#7C9B95', icon: 'Boxes' },
]

export const ACCOUNT_TYPES = [
  'Bank Account',
  'Cash',
  'UPI Wallet',
  'Credit Card',
  'Debit Card',
  'Digital Wallet',
  'Other',
]

export const PAYMENT_METHODS = [
  'Cash',
  'UPI',
  'Bank Transfer',
  'Credit Card',
  'Debit Card',
  'Wallet',
  'Other',
]

export const LENDING_STATUS = {
  active: 'Active',
  partially_paid: 'Partially Paid',
  fully_paid: 'Fully Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  written_off: 'Written Off',
}

export const INTEREST_TYPES = {
  none: 'No Interest',
  fixed: 'Fixed Interest',
  percentage: 'Percentage Interest',
  simple: 'Simple Interest',
}

export const DATE_RANGES = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '3m', label: '3 months', days: 90 },
  { key: '6m', label: '6 months', days: 180 },
  { key: '12m', label: '12 months', days: 365 },
]
