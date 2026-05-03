import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

import { Menu, X } from 'lucide-react'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/bollette': 'Bollette',
  '/consumi': 'Consumi & Costi',
  '/pun': 'Andamento PUN',
  '/analisi': 'Analisi AI Mercato',
  '/impostazioni': 'Impostazioni',
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] || 'Voltix'

  return (
    <div className="app-shell bg-noise">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="main-content">
        <header className="page-header">
          <div className="flex gap-12" style={{ alignItems: 'center' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ display: 'none', padding: '6px' }}
              id="sidebar-toggle"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <h1 className="page-title">{title}</h1>
          </div>
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <span className="font-mono text-muted" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>
              {new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--green)',
              boxShadow: '0 0 8px var(--green)'
            }} className="pulse" />
          </div>
        </header>

        <div className="page-body fade-in">
          <Outlet />
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          #sidebar-toggle { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
