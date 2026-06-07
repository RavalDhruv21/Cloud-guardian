'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSecurityEvents } from '@/lib/api'

export default function SecurityPage() {
  const router = useRouter()
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'auto-fixed' | 'review'>('all')

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await getSecurityEvents()
        setEvents(data.events || [])
      } catch (err) {
        console.error('Failed to fetch security events:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
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
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"/>
          <div className="text-xs text-gray-400">Loading security events...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Security events</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {autoFixed} auto-reverted · {needsReview} need review
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
          🛡 Auto-remediation active
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Auto-reverted', value: autoFixed, sub: 'fixed automatically', color: '#0F6E56' },
          { label: 'Need review', value: needsReview, sub: 'manual action needed', color: needsReview > 0 ? '#A32D2D' : '#0F6E56' },
          { label: 'Total events', value: events.length, sub: 'detected by CloudTrail', color: '#185FA5' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs text-gray-400 mb-2">{stat.label}</div>
            <div className="text-2xl font-semibold mb-1" style={{color: stat.color}}>{stat.value}</div>
            <div className="text-xs" style={{color: stat.color}}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5">
        {(['all', 'auto-fixed', 'review'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="text-xs px-3 py-1.5 rounded-md capitalize transition-all"
            style={{
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#111' : '#6b7280',
              fontWeight: tab === t ? 500 : 400,
              boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            {t === 'auto-fixed' ? 'Auto-fixed' : t === 'review' ? 'Needs review' : 'All events'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <div className="text-sm font-medium text-gray-700 mb-1">
            {events.length === 0 ? 'No security events detected' : 'No events match this filter'}
          </div>
          <div className="text-xs text-gray-400">
            {events.length === 0 ? 'Auto-remediation is watching your account 24/7' : 'Try a different filter'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((event, i) => {
            const isFixed = event.reverted || event.resolved
            return (
              <div
                key={i}
                className="bg-white rounded-xl border shadow-sm p-5"
                style={{
                  borderLeft: `3px solid ${isFixed ? '#0F6E56' : '#A32D2D'}`,
                  borderTop: '1px solid #f3f4f6',
                  borderRight: '1px solid #f3f4f6',
                  borderBottom: '1px solid #f3f4f6',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">
                        {event.event_type || event.summary || 'Security event'}
                      </span>
                      {isFixed ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
                          Auto-fixed ✓
                        </span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: '#FCEBEB', color: '#A32D2D'}}>
                          Needs review
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-gray-400 mb-3">
                      {event.instance_id || event.resource_id} · {event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="text-xs text-gray-700 leading-relaxed">
                        {event.likely_cause || event.detail || 'Security misconfiguration detected'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isFixed && (
                        <button
                          onClick={() => router.push('/agent-ai')}
                          className="text-xs px-3 py-1.5 rounded-lg"
                          style={{background: '#f0f9f4', color: '#0F6E56', border: '1px solid #a7f3d0'}}
                        >
                          🤖 Ask AI to investigate
                        </button>
                      )}
                      <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                        View details
                      </button>
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