'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMetrics, useAnomalies, useCostSuggestions, useSecurityEvents, useComplianceScore, useCostForecast } from '@/lib/queries'

// Refetch on the same 60s cadence the old setInterval polling used, but as
// a background revalidation — cached data still renders immediately instead
// of blocking behind a spinner on every visit.
const POLL = { refetchInterval: 60_000 }

export default function DashboardPage() {
  const router = useRouter()
  const [awsConnected, setAwsConnected] = useState(false)

  useEffect(() => {
    setAwsConnected(localStorage.getItem('aws_connected') === 'true')
  }, [])

  const metricsQuery = useMetrics(POLL)
  const anomaliesQuery = useAnomalies(undefined, POLL)
  const costsQuery = useCostSuggestions(POLL)
  const securityQuery = useSecurityEvents(POLL)
  const complianceQuery = useComplianceScore(POLL)
  const forecastQuery = useCostForecast(POLL)

  const metrics: any[] = metricsQuery.data?.metrics || []
  const anomalies: any[] = anomaliesQuery.data?.anomalies || []
  const costs: any[] = costsQuery.data?.suggestions || []
  const security: any[] = securityQuery.data?.events || []
  const compliance = complianceQuery.data
  const forecast = forecastQuery.data

  // Only block on the very first load of each query — once any of them has
  // data cached from a previous visit, background refetches shouldn't hide
  // the page behind a spinner again.
  const loading = [metricsQuery, anomaliesQuery, costsQuery, securityQuery, complianceQuery, forecastQuery]
    .some(q => q.isLoading)

  const unresolvedAnomalies = anomalies.filter((a: any) => !a.resolved)
  const totalSavings = costs.reduce((sum: number, c: any) => {
    const amt = parseFloat(c.estimated_saving?.replace('$','').replace('/mo','') || '0')
    return sum + amt
  }, 0)

  // Get unique instances from metrics
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const freshMetrics = metrics.filter((m: any) => m.timestamp > oneDayAgo || m.collected_at > oneDayAgo)
  const instances = [...new Set(freshMetrics.map((x: any) => x.instance_id))].slice(0, 4)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 animate-entrance">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" style={{boxShadow: '0 0 15px rgba(16,185,129,0.2)'}}/>
          <div className="text-sm font-medium" style={{color: 'rgba(255,255,255,0.5)'}}>Loading your AWS data...</div>
        </div>
      </div>
    )
  }

  if (!awsConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center animate-entrance">
        <div className="text-7xl mb-6 opacity-80" style={{textShadow: '0 0 30px rgba(255,255,255,0.2)'}}>☁️</div>
        <h1 className="text-2xl font-bold text-white mb-3">Welcome to Cloud Guardian</h1>
        <p className="text-sm text-white/50 max-w-md mx-auto mb-8 leading-relaxed">
          Connect your AWS account to start monitoring your infrastructure, detecting anomalies, and optimizing costs.
        </p>
        <button
          onClick={() => router.push('/connect-aws')}
          className="text-sm px-8 py-3.5 rounded-xl text-white font-bold transition-all hover:scale-105"
          style={{background: 'linear-gradient(135deg, #0F6E56, #094d3c)', boxShadow: '0 4px 15px rgba(15,110,86,0.3)', border: 'none', cursor: 'pointer'}}
        >
          🔌 Connect AWS account
        </button>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        {[
          { label: 'EC2 instances', value: instances.length || '—', sub: `${metrics.length} metrics collected`, color: '#34D399', glow: 'rgba(52,211,153,0.15)', delay: 'animate-entrance' },
          { label: 'Anomalies this week', value: unresolvedAnomalies.length || '0', sub: `${anomalies.length} total detected`, color: unresolvedAnomalies.length > 0 ? '#F87171' : '#34D399', glow: unresolvedAnomalies.length > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)', delay: 'animate-entrance-delay-1' },
          { label: 'Potential savings', value: totalSavings > 0 ? `$${totalSavings.toFixed(0)}` : '$0', sub: `${costs.length} opportunities found`, color: '#FBBF24', glow: 'rgba(251,191,36,0.15)', delay: 'animate-entrance-delay-2' },
          { label: 'Security events', value: security.length || '0', sub: 'from CloudTrail', color: '#60A5FA', glow: 'rgba(96,165,250,0.15)', delay: 'animate-entrance-delay-2' },
        ].map((stat, i) => (
          <div key={stat.label} className={`auth-glass p-5 relative overflow-hidden group ${stat.delay}`} style={{animationDelay: `${i * 0.1}s`}}>
            {/* Glow background on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{background: `radial-gradient(circle at top right, ${stat.glow}, transparent 70%)`}} />
            
            <div className="text-xs font-semibold uppercase tracking-wider mb-2 relative z-10" style={{color: 'rgba(255,255,255,0.4)'}}>{stat.label}</div>
            <div className="text-3xl font-bold mb-1 relative z-10" style={{color: stat.color, textShadow: `0 0 20px ${stat.glow}`}}>{stat.value}</div>
            <div className="text-xs relative z-10" style={{color: 'rgba(255,255,255,0.3)'}}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* EC2 instances */}
      <div className="animate-entrance" style={{animationDelay: '0.3s'}}>
        {instances.length > 0 ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">EC2 Instances — Latest CPU</h2>
              <button onClick={() => router.push('/metrics')} className="text-xs font-medium hover:text-emerald-400 transition-colors" style={{color: 'rgba(255,255,255,0.5)'}}>View all →</button>
            </div>
            <div className="grid grid-cols-2 gap-5 mb-8">
              {instances.map((instanceId) => {
                const instanceMetrics = freshMetrics.filter((m: any) => m.instance_id === instanceId) 
                const latest = instanceMetrics[0]
                const cpu = parseFloat(latest?.cpu_avg || 0)
                const status = cpu > 80 ? 'critical' : cpu > 60 ? 'warning' : 'normal'
                const statusColor = status === 'critical' ? '#F87171' : status === 'warning' ? '#FBBF24' : '#34D399'
                const statusBg = status === 'critical' ? 'rgba(248,113,113,0.1)' : status === 'warning' ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.1)'

                return (
                  <div
                    key={instanceId}
                    className="auth-glass p-5 transition-all hover:border-gray-600"
                    style={{borderLeft: `3px solid ${statusColor}`}}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-sm font-semibold text-white mb-0.5">{instanceId}</div>
                        <div className="text-xs" style={{color: 'rgba(255,255,255,0.4)'}}>us-east-1</div>
                      </div>
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{background: statusBg, color: statusColor, border: `1px solid ${statusBg}`}}>
                        {cpu.toFixed(1)}% CPU
                      </span>
                    </div>
                    
                    <div className="h-2 rounded-full mb-4 overflow-hidden" style={{background: 'rgba(255,255,255,0.05)'}}>
                      <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{width: `${cpu}%`, background: statusColor, boxShadow: `0 0 10px ${statusColor}`}}/>
                    </div>
                    
                    <div className="text-xs rounded-xl px-4 py-3 mb-4" style={{background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.05)'}}>
                      🧠 {cpu > 80 ? 'High CPU detected — check for anomalies' : cpu > 60 ? 'CPU elevated — monitoring closely' : 'All metrics within normal range'}
                    </div>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={() => router.push(`/metrics?instance=${instanceId}`)}
                        className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                        style={{background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)'}}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      >
                        View details
                      </button>
                      <button
                        onClick={() => router.push('/agent-ai')}
                        className="text-xs font-medium px-4 py-2 rounded-lg transition-all glow-btn"
                        style={{background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.2))', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.3)'}}
                      >
                        🤖 Ask AI
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="auth-glass rounded-2xl p-10 text-center mb-8">
            <div className="text-4xl mb-4 opacity-80">☁️</div>
            <div className="text-base font-semibold text-white mb-2">No metrics yet</div>
            <div className="text-sm mb-5 max-w-md mx-auto" style={{color: 'rgba(255,255,255,0.5)'}}>
              Metrics are collected every 15 minutes from your running EC2 instances.
            </div>
            <div className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-full" style={{background: 'rgba(16,185,129,0.1)', color: '#34D399'}}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Next collection in ~15 minutes
            </div>
          </div>
        )}
      </div>

      {/* ── Compliance Score + Cost Forecast ── */}
      <div className="grid grid-cols-2 gap-5 mb-5 animate-entrance" style={{animationDelay: '0.4s'}}>

        {/* Compliance Score */}
        <div className="auth-glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Security compliance</h3>
            <button
              onClick={() => router.push('/compliance')}
              className="text-xs font-medium hover:text-emerald-400 transition-colors"
              style={{color: 'rgba(255,255,255,0.5)'}}
            >
              Full report →
            </button>
          </div>
          {compliance?.score != null ? (() => {
            const score = compliance.score as number
            const grade = compliance.grade as string
            const scoreColor = score >= 90 ? '#34D399' : score >= 75 ? '#FBBF24' : score >= 60 ? '#F97316' : '#F87171'
            const scoreGlow = score >= 90 ? 'rgba(52,211,153,0.2)' : score >= 75 ? 'rgba(251,191,36,0.2)' : score >= 60 ? 'rgba(249,115,22,0.2)' : 'rgba(248,113,113,0.2)'
            return (
              <div>
                <div className="flex items-end gap-4 mb-4">
                  <div>
                    <div className="text-5xl font-black leading-none" style={{color: scoreColor, textShadow: `0 0 30px ${scoreGlow}`}}>
                      {score}
                    </div>
                    <div className="text-xs mt-1" style={{color: 'rgba(255,255,255,0.4)'}}>out of 100</div>
                  </div>
                  <div className="mb-1">
                    <span className="text-2xl font-black px-3 py-1 rounded-lg" style={{background: scoreGlow, color: scoreColor}}>
                      {grade}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full overflow-hidden mb-1" style={{background: 'rgba(255,255,255,0.05)'}}>
                      <div className="h-full rounded-full transition-all duration-1000" style={{width: `${score}%`, background: scoreColor, boxShadow: `0 0 8px ${scoreColor}`}} />
                    </div>
                    <div className="text-xs" style={{color: 'rgba(255,255,255,0.4)'}}>
                      {compliance.violations?.length === 0 ? '✓ All checks passed' : `${compliance.violations.length} issue(s) found`}
                    </div>
                  </div>
                </div>
                {compliance.violations?.length > 0 && (
                  <div className="space-y-2">
                    {compliance.violations.slice(0, 2).map((v: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.12)'}}>
                        <span className="text-xs mt-0.5" style={{color: '#F87171'}}>●</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{color: 'rgba(255,255,255,0.8)'}}>{v.detail}</div>
                          <div className="text-xs mt-0.5" style={{color: 'rgba(255,255,255,0.4)'}}>−{v.points_lost} pts · {v.fix}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })() : (
            <div className="text-center py-6">
              <div className="text-2xl mb-2 opacity-40">🛡</div>
              <div className="text-sm text-white/60">Running compliance scan…</div>
            </div>
          )}
        </div>

        {/* Cost Forecast */}
        <div className="auth-glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Cost forecast</h3>
            <button
              onClick={() => router.push('/cost-optimizer')}
              className="text-xs font-medium hover:text-emerald-400 transition-colors"
              style={{color: 'rgba(255,255,255,0.5)'}}
            >
              Optimizer →
            </button>
          </div>
          {forecast && !forecast.error && forecast.projected_month_total != null ? (() => {
            const proj = forecast.projected_month_total as number
            const last = forecast.last_month_cost as number
            const soFar = forecast.this_month_so_far as number
            const delta = forecast.delta_pct as number
            const isUp = delta > 0
            const deltaColor = delta > 20 ? '#F87171' : delta > 0 ? '#FBBF24' : '#34D399'
            const deltaGlow = delta > 20 ? 'rgba(248,113,113,0.15)' : delta > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)'
            return (
              <div>
                {forecast.alert && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-xs font-medium" style={{background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#FCA5A5'}}>
                    ⚠ On track to overspend vs last month
                  </div>
                )}
                <div className="flex items-end gap-3 mb-4">
                  <div>
                    <div className="text-3xl font-black" style={{color: '#fff'}}>${proj.toFixed(0)}</div>
                    <div className="text-xs mt-0.5" style={{color: 'rgba(255,255,255,0.4)'}}>projected this month</div>
                  </div>
                  <div className="mb-1 text-sm font-bold px-2 py-1 rounded-lg" style={{background: deltaGlow, color: deltaColor}}>
                    {isUp ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Spent so far this month', value: `$${soFar.toFixed(2)}` },
                    { label: 'Last month total', value: `$${last.toFixed(2)}` },
                    { label: 'Daily burn rate', value: `$${(forecast.daily_rate as number).toFixed(2)}/day` },
                    { label: `Day ${forecast.days_elapsed} of ${forecast.days_in_month}`, value: `${Math.round((forecast.days_elapsed / forecast.days_in_month) * 100)}% through month` },
                  ].map((row, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span style={{color: 'rgba(255,255,255,0.4)'}}>{row.label}</span>
                      <span className="font-medium text-white">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })() : (
            <div className="text-center py-6">
              <div className="text-2xl mb-2 opacity-40">📈</div>
              <div className="text-sm" style={{color: 'rgba(255,255,255,0.5)'}}>
                {forecast?.error ? 'Cost Explorer not available for this account' : 'Loading forecast…'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row — anomalies + cost suggestions */}
      <div className="grid grid-cols-2 gap-5 animate-entrance" style={{animationDelay: '0.5s'}}>
        {/* Recent anomalies */}
        <div className="auth-glass p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-white">Recent anomalies</h3>
            <span className="text-xs font-medium px-2 py-1 rounded-md" style={{background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)'}}>last 24h</span>
          </div>
          {anomalies.slice(0, 4).length > 0 ? (
            <div className="space-y-1">
              {anomalies.slice(0, 4).map((item: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-white/5 cursor-pointer">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{
                      background: item.severity === 'critical' ? '#F87171' : item.severity === 'high' ? '#FBBF24' : '#60A5FA',
                      boxShadow: `0 0 8px ${item.severity === 'critical' ? '#F87171' : item.severity === 'high' ? '#FBBF24' : '#60A5FA'}`
                    }}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate mb-0.5">{item.summary}</div>
                    <div className="text-xs truncate" style={{color: 'rgba(255,255,255,0.4)'}}>{item.instance_id}</div>
                  </div>
                  <div className="text-xs font-medium px-2 py-1 rounded flex-shrink-0 uppercase tracking-wider"
                    style={{
                      background: item.severity === 'critical' ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.05)',
                      color: item.severity === 'critical' ? '#FCA5A5' : 'rgba(255,255,255,0.5)'
                    }}>
                    {item.severity}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-2xl mb-2 opacity-50">✨</div>
              <div className="text-sm text-white font-medium mb-1">No anomalies detected</div>
              <div className="text-xs" style={{color: 'rgba(255,255,255,0.4)'}}>All systems running normally</div>
            </div>
          )}
        </div>

        {/* Cost suggestions */}
        <div className="auth-glass p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-white">Cost optimizer</h3>
            {totalSavings > 0 && (
              <span className="text-xs font-bold px-3 py-1 rounded-full border" style={{background: 'rgba(16,185,129,0.1)', color: '#34D399', borderColor: 'rgba(16,185,129,0.2)'}}>
                ${totalSavings.toFixed(0)}/mo savings
              </span>
            )}
          </div>
          {costs.slice(0, 3).length > 0 ? (
            <div className="space-y-1">
              {costs.slice(0, 3).map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-white/5 cursor-pointer">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background: 'rgba(255,255,255,0.05)'}}>
                    <span className="text-sm">💰</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate mb-0.5">{item.issue}</div>
                    <div className="text-xs truncate" style={{color: 'rgba(255,255,255,0.4)'}}>{item.resource_id}</div>
                  </div>
                  <div className="text-sm font-bold flex-shrink-0" style={{color: '#34D399'}}>{item.estimated_saving}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-2xl mb-2 opacity-50">✅</div>
              <div className="text-sm text-white font-medium mb-1">Highly optimized</div>
              <div className="text-xs" style={{color: 'rgba(255,255,255,0.4)'}}>No cost-saving opportunities found</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}