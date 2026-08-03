import { useEffect, useState } from 'react'
import { BarChart3, CalendarClock, FileText, LayoutGrid, Loader2, LogOut, Store, Users, Upload } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { useHash, navigate } from './lib/router'
import { AuthPage } from './pages/AuthPage'
import { Dashboard } from './pages/Dashboard'
import { Editor } from './pages/Editor'
import { Marketplace } from './pages/Marketplace'
import { Teams } from './pages/Teams'
import { Schedules } from './pages/Schedules'
import { Analytics } from './pages/Analytics'
import { Imports } from './pages/Imports'

function AppShell() {
  const { user, loading, logout } = useAuth()
  const parts = useHash()
  const route = parts[0] || ''

  useEffect(() => {
    if (!loading && !user && route !== '') navigate('auth')
  }, [loading, user, route])

  if (loading) {
    return <div className="boot"><Loader2 size={28} className="loader" /></div>
  }

  if (!user) {
    return <AuthPage />
  }

  const navItems = [
    { key: 'dashboard', label: 'Resumes', icon: FileText },
    { key: 'editor', label: 'Editor', icon: LayoutGrid },
    { key: 'marketplace', label: 'Marketplace', icon: Store },
    { key: 'import', label: 'Import', icon: Upload },
    { key: 'teams', label: 'Teams', icon: Users },
    { key: 'automation', label: 'Automation', icon: CalendarClock },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ]

  let page: React.ReactNode
  if (route === 'editor' && parts[1]) {
    page = <Editor docId={Number(parts[1])} />
  } else if (route === 'marketplace') {
    page = <Marketplace />
  } else if (route === 'import') {
    page = <Imports />
  } else if (route === 'teams') {
    page = <Teams />
  } else if (route === 'automation') {
    page = <Schedules />
  } else if (route === 'analytics') {
    page = <Analytics />
  } else {
    page = <Dashboard />
  }

  return (
    <div className="shell">
      <nav className="nav">
        <div className="nav-brand" onClick={() => navigate('dashboard')}>
          <span className="nav-logo">R</span>
          <span>Resume Studio</span>
        </div>
        <div className="nav-links">
          {navItems.map(n => (
            <button key={n.key} className={`nav-link ${route === n.key ? 'active' : ''}`} onClick={() => navigate(n.key)}>
              <n.icon size={16} /> {n.label}
            </button>
          ))}
        </div>
        <div className="nav-user">
          <span className="nav-avatar">{user.username[0]?.toUpperCase()}</span>
          <span className="nav-username">{user.username}</span>
          <button className="btn-icon-only" onClick={logout} title="Log out"><LogOut size={16} /></button>
        </div>
      </nav>
      <main className="main">{page}</main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
