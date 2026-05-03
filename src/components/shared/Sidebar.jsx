import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import {
  Zap, LayoutDashboard, FileText, BarChart3,
  TrendingUp, Sparkles, Settings, LogOut
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/bollette', icon: FileText, label: 'Bollette' },
  { to: '/consumi', icon: BarChart3, label: 'Consumi & Costi' },
  { to: '/pun', icon: TrendingUp, label: 'Andamento PUN' },
  { to: '/analisi', icon: Sparkles, label: 'Analisi AI Mercato' },
]

export default function Sidebar({ open, onClose }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-icon">
          <Zap size={18} color="#0a0b0e" fill="#0a0b0e" />
        </div>
        <div>
          <div className="logo-text">VOLTIX</div>
          <div className="logo-sub">Energia</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigazione</div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            <Icon size={16} className="icon" />
            {label}
          </NavLink>
        ))}

        <div className="nav-section-label" style={{ marginTop: 8 }}>Account</div>
        <NavLink
          to="/impostazioni"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <Settings size={16} className="icon" />
          Impostazioni
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <button className="nav-item w-full btn-ghost" onClick={handleLogout} style={{ border: 'none' }}>
          <LogOut size={16} className="icon" />
          Esci
        </button>
      </div>
    </aside>
  )
}
