import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { navigate } from '../lib/router'

export function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') {
        if (!username.trim()) throw new Error('Username required')
        await register(email, password, username)
      } else {
        await login(email, password)
      }
      navigate('dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="title">Resume Studio</h1>
        <p className="subtitle">Build, publish and track resumes with templates, teams and AI.</p>
        <div className="toggle-group auth-tabs">
          <button type="button" className={`toggle-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Log in</button>
          <button type="button" className={`toggle-btn ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Sign up</button>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} autoFocus={mode === 'login'} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="btn btn-block" disabled={busy}>
            {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
