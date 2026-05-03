import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import AppLayout from './components/shared/AppLayout'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import BollettePage from './pages/BollettePage'
import ConsumiPage from './pages/ConsumiPage'
import PunPage from './pages/PunPage'
import AnalisiAIPage from './pages/AnalisiAIPage'
import ImpostazioniPage from './pages/ImpostazioniPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="bollette" element={<BollettePage />} />
            <Route path="consumi" element={<ConsumiPage />} />
            <Route path="pun" element={<PunPage />} />
            <Route path="analisi" element={<AnalisiAIPage />} />
            <Route path="impostazioni" element={<ImpostazioniPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
