import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import AdminSidebar, { AdminSidebarDrawer } from './AdminSidebar'
import AdminHeader from './AdminHeader'

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-bg dark:bg-[#0F1614]">
      <AdminSidebar />
      <AdminSidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
