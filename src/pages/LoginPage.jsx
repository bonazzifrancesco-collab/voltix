import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { Zap } from 'lucide-react'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) throw error
      } else {
        const { error } = await signUp(email, password)
        if (error) throw error
        setSuccess('Registrazione avvenuta! Controlla la email per confermare.')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '20px'
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div className="flex-center flex-col gap-8" style={{ marginBottom: '40px' }}>
          <div style={{
            width: 56, height: 56,
            background: 'var(--amber)',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Zap size={28} color="#0a0b0e" fill="#0a0b0e" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>VOLTIX</div>
            <div className="font-mono text-muted" style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>
              Gestione Energia
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          <div className="tabs" style={{ marginBottom: '24px' }}>
            <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')} style={{ flex: 1 }}>Accedi</button>
            <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')} style={{ flex: 1 }}>Registrati</button>
          </div>

          <div className="flex-col gap-16">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                placeholder="nome@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {error && (
              <div className="badge badge-error" style={{ padding: '8px 12px' }}>{error}</div>
            )}
            {success && (
              <div className="badge badge-success" style={{ padding: '8px 12px' }}>{success}</div>
            )}

            <button
              className="btn btn-primary w-full"
              style={{ justifyContent: 'center', padding: '12px' }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : null}
              {mode === 'login' ? 'Accedi' : 'Crea Account'}
            </button>
          </div>
        </div>

        <p className="text-center text-muted font-mono" style={{ fontSize: '0.65rem', marginTop: 20, letterSpacing: '0.05em' }}>
          Monitoraggio energetico professionale
        </p>
      </div>
    </div>
  )
}
