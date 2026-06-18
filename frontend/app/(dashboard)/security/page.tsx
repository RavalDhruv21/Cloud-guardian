'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSecurityEvents } from '@/lib/api'

export default function SecurityPage() {
  const router = useRouter()
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'auto-fixed' | 'review'>('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    const fetchEvents = async (isInitial = false) => {
      try {
        const data = await getSecurityEvents()
        setEvents(data.events || [])
      } catch (err) {
        console.error('Failed to fetch security events:', err)
      } finally {
        if (isInitial) setLoading(false)
      }
    }

    fetchEvents(true)
    // Poll every 5 seconds so new events appear within 5s of detection
    interval = setInterval(() => fetchEvents(false), 5000)
    return () => clearInterval(interval)
  }, [])

  const filtered = events.filter(e => {
    if (tab === 'auto-fixed') return e.reverted || e.resolved
    if (tab === 'review') return !e.reverted && !e.resolved
    return true
  })

  const autoFixed = events.filter(e => e.reverted || e.resolved).length
  const needsReview = events.filter(e => !e.reverted && !e.resolved).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 animate-entrance">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" style={{boxShadow: '0 0 15px rgba(16,185,129,0.2)'}}/>
          <div className="text-xs text-white/50">Loading security events...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-entrance w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Security events</h1>
          <p className="text-xs text-white/50 mt-0.5">
            {autoFixed} auto-reverted · {needsReview} need review
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.15)]" style={{background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)'}}>
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          Auto-remediation active
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5 mb-8">
        {[
          { label: 'Auto-reverted', value: autoFixed, sub: 'fixed automatically', color: '#34D399', glow: 'rgba(52,211,153,0.15)' },
          { label: 'Need review', value: needsReview, sub: 'manual action needed', color: needsReview > 0 ? '#F87171' : '#34D399', glow: needsReview > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)' },
          { label: 'Total events', value: events.length, sub: 'detected by CloudTrail', color: '#60A5FA', glow: 'rgba(96,165,250,0.15)' },
        ].map((stat, i) => (
          <div key={stat.label} className="auth-glass rounded-2xl p-5" style={{animationDelay: `${i * 0.1}s`}}>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">{stat.label}</div>
            <div className="text-3xl font-bold mb-1" style={{color: stat.color, textShadow: `0 0 15px ${stat.glow}`}}>{stat.value}</div>
            <div className="text-xs font-medium" style={{color: stat.color}}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit mb-6" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
        {(['all', 'auto-fixed', 'review'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="text-xs px-4 py-1.5 rounded-lg capitalize transition-all"
            style={{
              background: tab === t ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.5)',
              fontWeight: tab === t ? 600 : 400,
              boxShadow: tab === t ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
            }}
          >
            {t === 'auto-fixed' ? 'Auto-fixed' : t === 'review' ? 'Needs review' : 'All events'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="auth-glass rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4 opacity-80" style={{textShadow: '0 0 20px rgba(52,211,153,0.3)'}}>🛡️</div>
          <div className="text-sm font-semibold text-white mb-2">
            {events.length === 0 ? 'No security events detected' : 'No events match this filter'}
          </div>
          <div className="text-xs text-white/50 max-w-md mx-auto">
            {events.length === 0 ? 'Auto-remediation is watching your account 24/7' : 'Try a different filter'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((event, i) => {
            const isFixed = event.reverted || event.resolved
            return (
              <div
                key={i}
                className="auth-glass rounded-2xl p-5 transition-all hover:scale-[1.01]"
                style={{
                  borderLeft: `3px solid ${isFixed ? '#34D399' : '#F87171'}`,
                  animationDelay: `${i * 0.05}s`
                }}
              >
                <div className="flex items-start justify-between gap-5">
                  <div className="flex-1">

                    {/* Title + badge */}
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <span className="text-base font-semibold text-white">
                        {event.event_type || event.summary || 'Security event'}
                      </span>
                      {isFixed ? (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider" style={{background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)'}}>
                          Auto-fixed ✓
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider" style={{background: 'rgba(248,113,113,0.15)', color: '#F87171', border: '1px solid rgba(248,113,113,0.2)'}}>
                          Needs review
                        </span>
                      )}
                    </div>

                    {/* Subtitle */}
                    <div className="text-xs text-white/40 mb-4 font-mono">
                      {event.instance_id || event.resource_id || '—'} <span className="mx-2 font-sans">•</span> {event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}
                    </div>

                    {/* Detail box */}
                    <div className="rounded-xl p-4 mb-4" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                      <div className="text-sm text-white/80 leading-relaxed">
                        {event.likely_cause || event.detail || 'Security misconfiguration detected'}
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-3">
                      {!isFixed && (
                        <button
                          onClick={() => router.push('/agent-ai')}
                          className="text-xs font-bold px-4 py-2 rounded-lg transition-all hover:scale-105"
                          style={{background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)', boxShadow: '0 0 10px rgba(16,185,129,0.1)'}}
                        >
                          🤖 Ask AI to investigate
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(expandedId === i ? null : i)}
                        className="text-xs font-medium px-4 py-2 rounded-lg transition-colors hover:bg-white/10"
                        style={{border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)'}}
                      >
                        {expandedId === i ? 'Hide details' : 'View details'}
                      </button>
                    </div>

                    {/* Expanded details */}
                    {expandedId === i && (
                      <div className="mt-4 pt-4" style={{borderTop: '1px solid rgba(255,255,255,0.05)'}}>
                        <div className="grid grid-cols-2 gap-4">
                          {[
                            { label: 'Resource', value: event.instance_id || event.resource_id || '—', mono: true },
                            { label: 'Detected at', value: event.timestamp ? new Date(event.timestamp).toLocaleString() : '—', mono: false },
                            { label: 'Action taken', value: isFixed ? 'Auto-reverted by Cloud Guardian' : 'Manual review required', mono: false },
                            { label: 'Severity', value: event.severity || 'critical', color: '#F87171', mono: false, upper: true },
                          ].map((d, idx) => (
                            <div key={idx} className="rounded-xl p-4" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                              <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-white/40">{d.label}</div>
                              <div className={`text-sm ${d.mono ? 'font-mono break-all' : ''} ${d.upper ? 'uppercase tracking-wider font-bold' : 'text-white/80'}`} style={{color: d.color || '#fff'}}>
                                {d.value}
                              </div>
                            </div>
                          ))}
                        </div>
                        {event.recommended_action && (
                          <div className="rounded-xl p-4 mt-4" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                            <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-white/40">Recommended action</div>
                            <div className="text-sm text-white/80 leading-relaxed">
                              {event.recommended_action}
                            </div>
                          </div>
                        )}
                        {event.reverted && (
                          <div className="mt-4 flex items-center gap-2 text-sm font-medium" style={{color: '#34D399'}}>
                            <span className="w-5 h-5 rounded-full flex items-center justify-center bg-emerald-500/20 text-emerald-400 text-xs border border-emerald-500/30">✓</span>
                            <span>Auto-remediation successfully blocked the misconfiguration</span>
                          </div>
                        )}
                      </div>
                    )}

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