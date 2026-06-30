'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getComplianceScore } from '@/lib/api'

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#F87171',
  high: '#FBBF24',
  medium: '#60A5FA',
  low: '#34D399',
}
const SEVERITY_BG: Record<string, string> = {
  critical: 'rgba(248,113,113,0.08)',
  high: 'rgba(251,191,36,0.08)',
  medium: 'rgba(96,165,250,0.08)',
  low: 'rgba(52,211,153,0.08)',
}
const TYPE_LABEL: Record<string, string> = {
  OPEN_SSH: 'Open SSH to public internet',
  PUBLIC_S3: 'S3 bucket public access',
  CRITICAL_ANOMALIES: 'Unresolved critical anomalies',
}
const TYPE_ICON: Record<string, string> = {
  OPEN_SSH: '🔓',
  PUBLIC_S3: '🪣',
  CRITICAL_ANOMALIES: '⚠',
}

export default function CompliancePage() {
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const result = await getComplianceScore()
      setData(result)
    } catch (err) {
      console.error('Compliance fetch error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 animate-entrance">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-medium" style={{color: 'rgba(255,255,255,0.5)'}}>Running compliance scan…</div>
        </div>
      </div>
    )
  }

  if (!data?.account_id) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center animate-entrance">
        <div className="text-5xl mb-4 opacity-60">🛡</div>
        <div className="text-lg font-semibold text-white mb-2">No AWS account connected</div>
        <p className="text-sm mb-6" style={{color: 'rgba(255,255,255,0.5)'}}>Connect your AWS account to run a compliance scan.</p>
        <button
          onClick={() => router.push('/connect-aws')}
          className="text-sm px-6 py-3 rounded-xl text-white font-bold"
          style={{background: 'linear-gradient(135deg, #0F6E56, #094d3c)', boxShadow: '0 4px 15px rgba(15,110,86,0.3)'}}
        >
          Connect AWS
        </button>
      </div>
    )
  }

  const score = data.score as number
  const grade = data.grade as string
  const violations = (data.violations || []) as any[]
  const scoreColor = score >= 90 ? '#34D399' : score >= 75 ? '#FBBF24' : score >= 60 ? '#F97316' : '#F87171'
  const scoreGlow = score >= 90 ? 'rgba(52,211,153,0.25)' : score >= 75 ? 'rgba(251,191,36,0.25)' : score >= 60 ? 'rgba(249,115,22,0.25)' : 'rgba(248,113,113,0.25)'

  const allChecks = [
    {
      key: 'OPEN_SSH',
      label: TYPE_LABEL['OPEN_SSH'],
      icon: TYPE_ICON['OPEN_SSH'],
      description: 'No security group should expose SSH (port 22) to 0.0.0.0/0',
      maxLost: 40,
    },
    {
      key: 'PUBLIC_S3',
      label: TYPE_LABEL['PUBLIC_S3'],
      icon: TYPE_ICON['PUBLIC_S3'],
      description: 'All S3 buckets should have Block Public Access enabled',
      maxLost: 30,
    },
    {
      key: 'CRITICAL_ANOMALIES',
      label: TYPE_LABEL['CRITICAL_ANOMALIES'],
      icon: TYPE_ICON['CRITICAL_ANOMALIES'],
      description: 'Critical anomalies should be investigated and resolved promptly',
      maxLost: 25,
    },
  ]

  const checkedAt = data.checked_at
    ? new Date(data.checked_at).toLocaleString()
    : 'just now'

  return (
    <div className="w-full animate-entrance">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs font-medium mb-1" style={{color: 'rgba(255,255,255,0.4)'}}>
            Account {data.account_id} · Last scanned {checkedAt}
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-xs px-4 py-2 rounded-lg border transition-all disabled:opacity-40 hover:bg-white/5"
          style={{borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)'}}
        >
          {refreshing ? 'Scanning…' : '↺ Re-scan'}
        </button>
      </div>

      {/* Score hero */}
      <div className="auth-glass p-8 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{background: `radial-gradient(ellipse at top left, ${scoreGlow}, transparent 60%)`}} />
        <div className="relative z-10 flex items-center gap-10">
          {/* Big score */}
          <div className="text-center flex-shrink-0">
            <div className="text-8xl font-black leading-none" style={{color: scoreColor, textShadow: `0 0 40px ${scoreGlow}`}}>
              {score}
            </div>
            <div className="text-sm mt-1" style={{color: 'rgba(255,255,255,0.4)'}}>/ 100</div>
          </div>

          {/* Grade + bar */}
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              <span className="text-4xl font-black px-4 py-2 rounded-xl" style={{background: scoreGlow, color: scoreColor}}>
                {grade}
              </span>
              <div>
                <div className="text-lg font-bold text-white">
                  {score >= 90 ? 'Excellent security posture' : score >= 75 ? 'Good — minor issues to address' : score >= 60 ? 'Fair — action recommended' : 'At risk — immediate action needed'}
                </div>
                <div className="text-sm mt-0.5" style={{color: 'rgba(255,255,255,0.5)'}}>
                  {violations.length === 0 ? 'All compliance checks passed' : `${violations.length} check(s) failed — ${violations.reduce((s: number, v: any) => s + (v.points_lost || 0), 0)} points deducted`}
                </div>
              </div>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{background: 'rgba(255,255,255,0.06)'}}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{width: `${score}%`, background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}cc)`, boxShadow: `0 0 12px ${scoreColor}`}}
              />
            </div>
          </div>
        </div>
      </div>

      {/* All checks */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-white mb-3">Compliance checks</h2>
        <div className="space-y-3">
          {allChecks.map(check => {
            const violation = violations.find((v: any) => v.type === check.key)
            const passed = !violation
            const statusColor = passed ? '#34D399' : SEVERITY_COLOR[violation?.severity || 'high']
            const statusBg = passed ? 'rgba(52,211,153,0.06)' : SEVERITY_BG[violation?.severity || 'high']
            return (
              <div key={check.key} className="auth-glass p-5 transition-all" style={{borderLeft: `3px solid ${statusColor}`}}>
                <div className="flex items-start gap-4">
                  <div className="text-2xl flex-shrink-0 mt-0.5">{check.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="text-sm font-semibold text-white">{check.label}</div>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{background: statusBg, color: statusColor}}
                      >
                        {passed ? '✓ PASS' : '✗ FAIL'}
                      </span>
                      {violation && (
                        <span className="text-xs font-medium" style={{color: 'rgba(255,255,255,0.4)'}}>
                          −{violation.points_lost} pts
                        </span>
                      )}
                    </div>
                    <div className="text-xs mb-2" style={{color: 'rgba(255,255,255,0.5)'}}>{check.description}</div>
                    {violation && (
                      <div className="rounded-lg p-3 mt-2" style={{background: statusBg, border: `1px solid ${statusColor}22`}}>
                        <div className="text-xs font-medium mb-1" style={{color: statusColor}}>Issue found</div>
                        <div className="text-xs mb-2" style={{color: 'rgba(255,255,255,0.7)'}}>{violation.detail}</div>
                        {violation.resources && violation.resources.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {violation.resources.slice(0, 5).map((r: string, ri: number) => (
                              <span key={ri} className="text-xs px-2 py-0.5 rounded font-mono" style={{background: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.6)'}}>
                                {r}
                              </span>
                            ))}
                            {violation.resources.length > 5 && (
                              <span className="text-xs px-2 py-0.5 rounded" style={{color: 'rgba(255,255,255,0.4)'}}>
                                +{violation.resources.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                        <div className="text-xs font-medium" style={{color: '#34D399'}}>
                          Fix: {violation.fix}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div className="auth-glass p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Quick actions</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'View security events', desc: 'See auto-remediation history', href: '/security', icon: '🛡' },
            { label: 'Review anomalies', desc: 'Resolve critical alerts', href: '/anomalies', icon: '⚠' },
            { label: 'Ask AI', desc: 'Get fix recommendations', href: '/agent-ai', icon: '🤖' },
          ].map(action => (
            <button
              key={action.href}
              onClick={() => router.push(action.href)}
              className="text-left p-4 rounded-xl transition-all hover:bg-white/5"
              style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)'}}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
            >
              <div className="text-xl mb-2">{action.icon}</div>
              <div className="text-xs font-semibold text-white mb-0.5">{action.label}</div>
              <div className="text-xs" style={{color: 'rgba(255,255,255,0.4)'}}>{action.desc}</div>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
