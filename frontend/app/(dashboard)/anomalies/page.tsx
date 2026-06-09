'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAnomalies, resolveAnomaly } from '@/lib/api'

const severityColor = (s: string) => ({
  critical: { bg: 'rgba(248,113,113,0.15)', color: '#F87171', dot: '#F87171' },
  high:     { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24', dot: '#FBBF24' },
  medium:   { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24', dot: '#FBBF24' },
  low:      { bg: 'rgba(59,130,246,0.15)', color: '#60A5FA', dot: '#60A5FA' },
}[s] || { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', dot: 'rgba(255,255,255,0.4)' })

export default function AnomaliesPage() {
  const router = useRouter()
  const [anomalies, setAnomalies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchAnomalies()
  }, [])

  const fetchAnomalies = async () => {
    try {
      const data = await getAnomalies()
      setAnomalies(data.anomalies || [])
    } catch (err) {
      console.error('Failed to fetch anomalies:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (instanceId: string, timestamp: string) => {
    try {
      await resolveAnomaly(instanceId, timestamp)
      setAnomalies(prev => prev.map(a =>
        a.instance_id === instanceId && a.timestamp === timestamp
          ? {...a, resolved: true}
          : a
      ))
    } catch (err) {
      console.error('Failed to resolve:', err)
    }
  }

  const filtered = anomalies.filter(a => {
    if (filter === 'unresolved' && a.resolved) return false
    if (filter === 'resolved' && !a.resolved) return false
    if (filter === 'critical' && a.severity !== 'critical') return false
    if (search && !a.instance_id?.toLowerCase().includes(search.toLowerCase()) &&
        !a.summary?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const unresolved = anomalies.filter(a => !a.resolved).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 animate-entrance">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" style={{boxShadow: '0 0 15px rgba(16,185,129,0.2)'}}/>
          <div className="text-xs text-white/50">Loading anomalies...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-entrance w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Anomalies</h1>
          <p className="text-xs text-white/50 mt-0.5">
            {unresolved} unresolved · {anomalies.length} total
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by instance ID or keyword..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-xs px-4 py-2.5 rounded-xl focus:outline-none transition-colors w-72"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff'
          }}
          onFocus={e => e.currentTarget.style.borderColor = '#0F6E56'}
          onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
        />
        <div className="flex gap-1 p-1 rounded-xl" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
          {['all', 'unresolved', 'resolved', 'critical'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs px-4 py-1.5 rounded-lg capitalize transition-all"
              style={{
                background: filter === f ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: filter === f ? '#fff' : 'rgba(255,255,255,0.5)',
                fontWeight: filter === f ? 600 : 400,
                boxShadow: filter === f ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="auth-glass rounded-2xl p-12 text-center mt-4">
          <div className="text-4xl mb-4 opacity-80">✅</div>
          <div className="text-sm font-semibold text-white mb-2">
            {anomalies.length === 0 ? 'No anomalies detected yet' : 'No anomalies match your filter'}
          </div>
          <div className="text-xs text-white/50 max-w-md mx-auto">
            {anomalies.length === 0 ? 'AI analysis runs automatically when metrics are collected' : 'Try changing the filter'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((anomaly, i) => {
            const colors = severityColor(anomaly.severity)
            return (
              <div
                key={i}
                className="auth-glass rounded-2xl p-5 transition-all hover:scale-[1.01]"
                style={{
                  borderLeft: `3px solid ${colors.dot}`,
                  opacity: anomaly.resolved ? 0.6 : 1,
                  animationDelay: `${i * 0.05}s`
                }}
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{background: colors.dot, boxShadow: `0 0 10px ${colors.dot}`}}/>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <span className="text-base font-semibold text-white">{anomaly.summary}</span>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider" style={{background: colors.bg, color: colors.color, border: `1px solid ${colors.bg}`}}>
                        {anomaly.severity}
                      </span>
                      {anomaly.resolved && (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider" style={{background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)'}}>
                          Resolved ✓
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 mb-4 font-mono">
                      {anomaly.instance_id} <span className="mx-2 font-sans">•</span> {anomaly.timestamp ? new Date(anomaly.timestamp).toLocaleString() : ''}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-5">
                      <div className="rounded-xl p-4" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-white/40">Likely cause</div>
                        <div className="text-sm text-white/80 leading-relaxed">{anomaly.likely_cause || 'Analyzing...'}</div>
                      </div>
                      <div className="rounded-xl p-4" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-white/40">Recommended action</div>
                        <div className="text-sm text-white/80 leading-relaxed">{anomaly.recommended_action || 'Check instance metrics'}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {!anomaly.resolved && (
                        <button
                          onClick={() => handleResolve(anomaly.instance_id, anomaly.timestamp)}
                          className="text-xs font-medium px-4 py-2 rounded-lg transition-colors hover:bg-white/10"
                          style={{border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)'}}
                        >
                          Mark resolved
                        </button>
                      )}
                      <button
                        onClick={() => router.push('/agent-ai')}
                        className="text-xs font-bold px-4 py-2 rounded-lg transition-all hover:scale-105"
                        style={{background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)', boxShadow: '0 0 10px rgba(16,185,129,0.1)'}}
                      >
                        🤖 Ask AI
                      </button>
                      {anomaly.cost_impact && (
                        <span className="text-xs text-white/40 ml-auto font-medium">
                          Cost impact: <span className="text-amber-400">{anomaly.cost_impact}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}