'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getAnomalies } from '@/lib/api'
import { getRegion, setRegion } from '@/lib/region'
import { logoutUser, getCurrentUser } from '@/lib/auth'

const navItems = [
  {
    section: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: '⊞' },
      { label: 'Live metrics', href: '/metrics', icon: '⚡' },
    ]
  },
  {
    section: 'Monitor',
    items: [
      { label: 'Anomalies', href: '/anomalies', icon: '⚠', badge: null },
      { label: 'Security', href: '/security', icon: '🛡' },
      { label: 'Cost optimizer', href: '/cost-optimizer', icon: '💰' },
    ]
  },
  {
    section: 'Reports',
    items: [
      { label: 'Weekly reports', href: '/reports', icon: '📋' },
      { label: 'Audit log', href: '/audit', icon: '🕐' },
    ]
  },
  {
    section: 'AI',
    items: [
      { label: 'Agent AI', href: '/agent-ai', icon: '🤖' },
    ]
  },
  {
    section: 'Setup',
    items: [
      { label: 'Connect AWS', href: '/connect-aws', icon: '🔌' },
      { label: 'Alert rules', href: '/alert-rules', icon: '🔔' },
      { label: 'Settings', href: '/settings', icon: '⚙' },
    ]
  },
]

const getStoredProfile = () => {
  if (typeof window === 'undefined') return { name: 'User', email: '' }
  try {
    const stored = localStorage.getItem('cg_user_profile')
    return stored ? JSON.parse(stored) : { name: 'User', email: '' }
  } catch {
    return { name: 'User', email: '' }
  }
}

const getInitials = (name: string) => {
  if (!name) return 'U'
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name[0].toUpperCase()
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [accountLabel] = useState('My AWS Account')
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [currentRegion, setCurrentRegion] = useState('us-east-1')
  const [profile, setProfile] = useState({ name: 'User', email: '', aws_account_id: '' })
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [awsConnected, setAwsConnected] = useState(false)

  // Auth guard — redirect to login if not authenticated
  useEffect(() => {
    const user = getCurrentUser()
    if (!user) {
      router.replace('/')
    } else {
      setAuthChecked(true)
    }
  }, [])

  // Fetch unresolved anomalies count
  useEffect(() => {
    if (!authChecked) return
    const fetchCount = async () => {
      try {
        const data = await getAnomalies()
        const unresolved = (data.anomalies || []).filter((a: any) => !a.resolved).length
        setUnresolvedCount(unresolved)
      } catch {
        setUnresolvedCount(0)
      }
    }
    fetchCount()
  }, [authChecked])

  // Load region
  useEffect(() => {
    setCurrentRegion(getRegion())
    const handleRegionChange = () => setCurrentRegion(getRegion())
    window.addEventListener('region-changed', handleRegionChange)
    return () => window.removeEventListener('region-changed', handleRegionChange)
  }, [])

  // Load profile and AWS connection state
  useEffect(() => {
    const updateProfileAndAWS = () => {
      setProfile(getStoredProfile())
      setAwsConnected(localStorage.getItem('aws_connected') === 'true')
    }
    updateProfileAndAWS()
    window.addEventListener('profile-updated', updateProfileAndAWS)
    return () => window.removeEventListener('profile-updated', updateProfileAndAWS)
  }, [])

  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRegion(e.target.value)
    setCurrentRegion(e.target.value)
    window.location.reload()
  }

  const handleLogout = () => {
    setShowLogoutConfirm(false)
    logoutUser()
  }

  // Show nothing while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: '#050B18'}}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{borderColor: '#10B981', borderTopColor: 'transparent'}}
          />
          <div className="text-xs" style={{color: 'rgba(255,255,255,0.4)'}}>Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden text-white relative" style={{background: '#050B18'}}>

      {/* ═══════════ ANIMATED BACKGROUND ═══════════ */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        {/* Grid pattern */}
        <div className="absolute inset-0" style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }} />
        {/* Floating orbs */}
        <div className="absolute rounded-full" style={{
          width: 600, height: 600, top: '-20%', left: '-10%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.04) 0%, transparent 70%)',
          animation: 'float-orb 22s ease-in-out infinite',
        }} />
        <div className="absolute rounded-full" style={{
          width: 500, height: 500, bottom: '-20%', right: '-10%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.03) 0%, transparent 70%)',
          animation: 'float-orb-reverse 26s ease-in-out infinite 3s',
        }} />
      </div>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center animate-entrance"
          style={{background: 'rgba(5,11,24,0.85)', backdropFilter: 'blur(8px)'}}
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="auth-glass rounded-3xl p-6 shadow-2xl relative overflow-hidden"
            style={{width: 340}}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-emerald-500 rounded-full blur-[8px] opacity-60" />
            
            {/* Icon */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)'}}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>

            {/* Text */}
            <div className="text-center mb-6">
              <div className="text-base font-semibold text-white mb-2">
                Sign out of Cloud Guardian?
              </div>
              <div className="text-xs leading-relaxed" style={{color: 'rgba(255,255,255,0.5)'}}>
                Your AWS account will remain connected. You can sign back in anytime to resume monitoring.
              </div>
            </div>

            {/* User info card */}
            <div
              className="flex items-center gap-3 p-3.5 rounded-2xl mb-6"
              style={{background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)'}}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                style={{background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', color: '#fff'}}
              >
                {getInitials(profile.name)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {profile.name || 'User'}
                </div>
                <div className="text-xs truncate" style={{color: 'rgba(255,255,255,0.4)'}}>
                  {profile.email || ''}
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 text-sm py-3 rounded-xl font-medium transition-colors"
                style={{background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)'}}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              >
                Stay signed in
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 text-sm py-3 rounded-xl font-medium text-white transition-colors"
                style={{background: 'linear-gradient(135deg, #EF4444, #B91C1C)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'}}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-60 flex-shrink-0 flex flex-col h-full relative z-10" style={{
        background: 'rgba(5, 11, 24, 0.7)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
      }}>

        {/* Logo */}
        <div className="px-5 py-5 border-b" style={{borderColor: 'rgba(255,255,255,0.05)'}}>
          <Link href="/" className="flex items-center gap-3 group">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white transition-transform group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #10B981, #059669)',
                boxShadow: '0 0 15px rgba(16,185,129,0.3)',
              }}
            >
              CG
            </div>
            <div>
              <div className="text-sm font-semibold text-white tracking-tight">Cloud Guardian</div>
              <div className="text-[10px] uppercase tracking-wider font-medium" style={{color: 'rgba(16,185,129,0.8)'}}>
                Pro Edition
              </div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          {navItems.map((group) => (
            <div key={group.section} className="mb-4">
              <div
                className="px-5 py-2 text-[10px] font-bold tracking-[0.2em] uppercase mb-1"
                style={{color: 'rgba(255,255,255,0.3)'}}
              >
                {group.section}
              </div>
              {group.items.map((item) => {
                const isActive = pathname === item.href
                const isAgent = item.label === 'Agent AI'
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className="flex items-center gap-3 px-5 py-2.5 mx-3 rounded-xl text-sm transition-all group"
                    style={{
                      color: isActive ? '#fff' : isAgent ? '#34D399' : 'rgba(255,255,255,0.5)',
                      background: isActive
                        ? 'rgba(255,255,255,0.08)'
                        : isAgent
                        ? 'rgba(16,185,129,0.1)'
                        : 'transparent',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      e.currentTarget.style.color = isActive ? '#fff' : isAgent ? '#6EE7B7' : '#fff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = isActive
                        ? 'rgba(255,255,255,0.08)'
                        : isAgent
                        ? 'rgba(16,185,129,0.1)'
                        : 'transparent';
                      e.currentTarget.style.color = isActive ? '#fff' : isAgent ? '#34D399' : 'rgba(255,255,255,0.5)';
                    }}
                  >
                    <span className={`text-lg transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} style={{
                      filter: isAgent ? 'drop-shadow(0 0 8px rgba(52,211,153,0.5))' : 'none'
                    }}>
                      {item.icon}
                    </span>
                    <span className="flex-1 font-medium">{item.label}</span>
                    {item.label === 'Anomalies' && unresolvedCount > 0 && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse"
                        style={{background: '#EF4444', color: '#fff', boxShadow: '0 0 10px rgba(239,68,68,0.5)'}}
                      >
                        {unresolvedCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="border-t p-5" style={{borderColor: 'rgba(255,255,255,0.05)'}}>
          {/* AWS Account chip */}
          <div
            className="flex items-center gap-2.5 mb-4 px-3 py-2 rounded-xl"
            style={{background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)'}}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{background: '#10B981', boxShadow: '0 0 8px #10B981', animation: 'pulse-subtle 2s infinite'}}
            />
            <span className="text-xs font-medium truncate" style={{color: 'rgba(255,255,255,0.7)'}}>
              {accountLabel}
            </span>
          </div>

          {/* User row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', color: '#fff'}}
              >
                {getInitials(profile.name)}
              </div>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium truncate text-white"
                >
                  {profile.name || 'User'}
                </div>
                <div className="text-[10px] uppercase font-medium tracking-wider" style={{color: 'rgba(16,185,129,0.8)'}}>
                  Pro · Beta
                </div>
              </div>
            </div>

            {/* Logout icon button */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              title="Sign out"
              className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all group"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
              }}
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="group-hover:stroke-red-400 transition-colors"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>

      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10" style={{background: 'transparent'}}>

        {/* Topbar */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-8 h-16"
          style={{
            background: 'rgba(5, 11, 24, 0.4)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.05)'
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-lg font-semibold text-white">
              {navItems.flatMap(g => g.items).find(i => i.href === pathname)?.label || 'Dashboard'}
            </span>
            <div
              className="flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border"
              style={{background: 'rgba(16,185,129,0.1)', color: '#34D399', borderColor: 'rgba(16,185,129,0.2)'}}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{background: '#10B981', boxShadow: '0 0 6px #10B981', animation: 'pulse-subtle 2s infinite'}}
              />
              Live
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={currentRegion}
              onChange={handleRegionChange}
              className="dark-input w-auto text-xs py-1.5 cursor-pointer appearance-none px-4 pr-8"
              style={{
                borderRadius: '999px',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 10px center',
                backgroundSize: '12px'
              }}
            >
              {['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1', 'ap-southeast-1'].map(r => (
                <option key={r} value={r} style={{background: '#0A1628', color: '#fff'}}>{r}</option>
              ))}
            </select>
            {awsConnected && (
              <div
                className="flex items-center gap-2 text-xs font-medium px-4 py-1.5 rounded-full"
                style={{background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)'}}
              >
                <span>Account #{profile.aws_account_id || process.env.NEXT_PUBLIC_AWS_ACCOUNT_ID || '—'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {children}
        </div>

      </div>
    </div>
  )
}