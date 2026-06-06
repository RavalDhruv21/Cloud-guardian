'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
      { label: 'Anomalies', href: '/anomalies', icon: '⚠', badge: 3 },
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
      { label: 'Alert rules', href: '/settings', icon: '🔔' },
      { label: 'Settings', href: '/settings', icon: '⚙' },
    ]
  },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [accountLabel] = useState('My AWS Account')

  return (
    <div className="flex h-screen overflow-hidden" style={{background: '#0A1628'}}>

      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 flex flex-col h-full" style={{background: '#0A1628'}}>

        {/* Logo */}
        <div className="px-4 py-4 border-b" style={{borderColor: 'rgba(255,255,255,0.08)'}}>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{background: '#0F6E56'}}>
              CG
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Cloud Guardian</div>
              <div className="text-xs" style={{color: 'rgba(255,255,255,0.35)'}}>AWS Infrastructure AI</div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((group) => (
            <div key={group.section} className="mb-1">
              <div className="px-4 py-2 text-xs font-medium tracking-widest uppercase" style={{color: 'rgba(255,255,255,0.28)'}}>
                {group.section}
              </div>
              {group.items.map((item) => {
                const isActive = pathname === item.href
                const isAgent = item.label === 'Agent AI'
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs transition-all"
                    style={{
                      color: isActive ? '#fff' : isAgent ? '#9FE1CB' : 'rgba(255,255,255,0.5)',
                      background: isActive ? 'rgba(255,255,255,0.08)' : isAgent ? 'rgba(15,110,86,0.15)' : 'transparent',
                      borderLeft: isActive ? '2px solid #1D9E75' : isAgent ? '2px solid #0F6E56' : '2px solid transparent',
                    }}
                  >
                    <span>{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{background: '#A32D2D', color: '#fff'}}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Account + User */}
        <div className="border-t p-4" style={{borderColor: 'rgba(255,255,255,0.08)'}}>
          <div className="flex items-center gap-2 mb-3 px-1 py-1.5 rounded-lg" style={{background: 'rgba(255,255,255,0.05)'}}>
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: '#1D9E75'}}></div>
            <span className="text-xs truncate" style={{color: 'rgba(255,255,255,0.6)'}}>{accountLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0" style={{background: '#185FA5', color: '#B5D4F4'}}>
              RK
            </div>
            <div>
              <div className="text-xs font-medium" style={{color: 'rgba(255,255,255,0.7)'}}>Rishi K.</div>
              <div className="text-xs" style={{color: 'rgba(255,255,255,0.3)'}}>Pro · Beta</div>
            </div>
          </div>
        </div>

      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{background: '#F0F4F8'}}>

        {/* Topbar */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 h-12 border-b" style={{background: '#fff', borderColor: '#e5e7eb'}}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-800">
              {navItems.flatMap(g => g.items).find(i => i.href === pathname)?.label || 'Dashboard'}
            </span>
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{background: '#f0f9f4', color: '#0F6E56'}}>
              <div className="w-1.5 h-1.5 rounded-full" style={{background: '#1D9E75', animation: 'pulse 2s infinite'}}></div>
              Live
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border" style={{borderColor: '#e5e7eb', color: '#6b7280'}}>
              <span>☁</span>
              <span>us-east-1</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border" style={{borderColor: '#e5e7eb', color: '#6b7280'}}>
              <span>Account #8087-1503</span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>

      </div>
    </div>
  )
}