import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Target,
  PiggyBank,
  HandCoins,
  Wallet,
  BarChart3,
  FileText,
  Settings,
  Home,
  CalendarClock,
} from 'lucide-react'

export const navSections = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Money',
    items: [
      { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
      { to: '/income', label: 'Income', icon: TrendingUp },
      { to: '/expenses', label: 'Expenses', icon: TrendingDown },
      { to: '/accounts', label: 'Accounts', icon: Wallet },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/budgets', label: 'Budgets', icon: PiggyBank },
      { to: '/bills', label: 'Bills & Recurring', icon: CalendarClock },
      { to: '/goals', label: 'Savings Goals', icon: Target },
    ],
  },
  {
    label: 'Lending',
    items: [
      { to: '/lending/given', label: 'Money Lent', icon: HandCoins },
      { to: '/lending/received', label: 'Money Received', icon: HandCoins },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    label: 'System',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
]

export const mobileNav = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/lending/given', label: 'Lending', icon: HandCoins },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'More', icon: Settings },
]
