import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileNavigation from './MobileNavigation'
import { QuickActionsProvider } from '../../features/command/QuickActionsProvider'
import CommandPalette from '../../features/command/CommandPalette'

export default function AppLayout() {
  return (
    <QuickActionsProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto px-4 pb-20 sm:px-6 lg:px-8 lg:pb-6">
            <Outlet />
          </main>
          <MobileNavigation />
        </div>
      </div>
      <CommandPalette />
    </QuickActionsProvider>
  )
}
