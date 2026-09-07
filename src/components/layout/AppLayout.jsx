import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar, { MobileSidebarDrawer } from './Sidebar'
import Header from './Header'
import MobileNavigation from './MobileNavigation'
import { QuickActionsProvider } from '../../features/command/QuickActionsProvider'
import CommandPalette from '../../features/command/CommandPalette'

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <QuickActionsProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <MobileSidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onMenuClick={() => setDrawerOpen(true)} />
          <main className="flex-1 overflow-y-auto px-4 pb-20 sm:px-6 lg:px-8 lg:pb-6">
            <Outlet />
          </main>
          <MobileNavigation onMore={() => setDrawerOpen(true)} />
        </div>
      </div>
      <CommandPalette />
    </QuickActionsProvider>
  )
}
