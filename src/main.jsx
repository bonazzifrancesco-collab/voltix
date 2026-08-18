import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/main.css'
import './styles/mobile.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('Voltix Error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0a0b0e', color: '#e8eaf0', gap: 16, padding: 24
        }}>
          <div style={{ fontSize: '2rem' }}>⚡</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Qualcosa è andato storto</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#8891a4',
            background: '#111318', padding: '12px 16px', borderRadius: 8,
            border: '1px solid #1e2128', maxWidth: 500, wordBreak: 'break-word' }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/' }}
            style={{ background: '#f5a623', color: '#0a0b0e', border: 'none',
              padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
            Torna alla Dashboard
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
