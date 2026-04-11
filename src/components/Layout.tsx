import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { SessionProvider } from '../contexts/SessionContext'

export default function Layout() {
  return (
    <SessionProvider>
      <div className="flex h-screen overflow-hidden bg-lavender-50">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </SessionProvider>
  )
}
