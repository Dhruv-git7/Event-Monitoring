'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginUser, registerUser } from '../../lib/api'

export default function LoginPage() {
  const [email, setEmail] = useState('admin@platform.local')
  const [password, setPassword] = useState('Admin@123')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const cleanEmail = email.trim().toLowerCase()
      if (mode === 'login') {
        await loginUser(cleanEmail, password)
      } else {
        await registerUser(cleanEmail, password, name.trim())
        await loginUser(cleanEmail, password)
      }
      router.replace('/')
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Authentication failed. Verify credentials and API service status.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(360px, 460px) 1fr', background: '#f4f5f7' }}>
      <section style={{ background: '#ffffff', borderRight: '1px solid #dde1e7', padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ color: '#1565c0', fontWeight: 800, fontSize: 24, letterSpacing: -0.3 }}>MonitorOne</div>
          <div style={{ color: '#5f6b7c', marginTop: 6 }}>Enterprise Infrastructure Monitoring</div>
        </div>

        <form onSubmit={submit} style={{ width: '100%' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, color: '#1a1a2e', fontWeight: 700 }}>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
          <p style={{ margin: '0 0 20px', color: '#5f6b7c', lineHeight: 1.45 }}>
            {mode === 'login' ? 'Use your platform credentials to access monitoring.' : 'Create a user account for this tenant.'}
          </p>

          {error && (
            <div style={{ border: '1px solid #ef9a9a', background: '#ffebee', color: '#c62828', padding: '9px 10px', borderRadius: 4, marginBottom: 14, fontSize: 13 }}>
              {error}
            </div>
          )}

          {mode === 'register' && (
            <label style={labelStyle}>
              Name
              <input className="field" style={inputStyle} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
            </label>
          )}

          <label style={labelStyle}>
            Email address
            <input className="field" style={inputStyle} placeholder="admin@platform.local" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </label>

          <label style={labelStyle}>
            Password
            <div style={{ position: 'relative' }}>
              <input
                className="field"
                style={{ ...inputStyle, paddingRight: 74 }}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: 6, top: 6, height: 28, border: '1px solid #cfd6df', background: '#fff', color: '#1565c0', borderRadius: 4, padding: '0 9px', fontSize: 12 }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <button className="btn btn-primary" style={{ width: '100%', height: 38, marginTop: 8, fontWeight: 700 }} disabled={loading}>
            {loading ? 'Authenticating...' : mode === 'login' ? 'Login' : 'Create account'}
          </button>

          <button
            type="button"
            className="btn"
            style={{ width: '100%', height: 36, marginTop: 10 }}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
          </button>
        </form>

        <div style={{ marginTop: 22, borderTop: '1px solid #dde1e7', paddingTop: 14, color: '#5f6b7c', fontSize: 12, lineHeight: 1.6 }}>
          <b>Default local credentials</b><br />
          Email: <span className="mono">admin@platform.local</span><br />
          Password: <span className="mono">Admin@123</span>
        </div>
      </section>

      <section style={{ padding: 44, display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: 680 }}>
          <h2 style={{ fontSize: 30, lineHeight: 1.2, margin: '0 0 12px', color: '#1a1a2e' }}>Infrastructure visibility</h2>
          <p style={{ color: '#5f6b7c', fontSize: 15, lineHeight: 1.7, marginBottom: 22 }}>
            Monitor hosts, agents, services, metrics, alert rules, problems, maintenance windows and availability reports from one compact operations console.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12 }}>
            {['Real-time metric collection', 'Problem lifecycle tracking', 'Agent heartbeat monitoring', 'Availability and audit reports'].map(item => (
              <div key={item} style={{ background: '#fff', border: '1px solid #dde1e7', borderRadius: 4, padding: 12 }}>
                <div style={{ color: '#1565c0', fontWeight: 700 }}>{item}</div>
                <div style={{ color: '#5f6b7c', fontSize: 12, marginTop: 4 }}>Operationally focused and production-oriented.</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', color: '#1a1a2e', fontWeight: 600, fontSize: 13, marginBottom: 12 }
const inputStyle: React.CSSProperties = { width: '100%', marginTop: 6, height: 38 }
