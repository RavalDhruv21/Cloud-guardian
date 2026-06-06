'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const securityEvents = [
  {
    id: 1,
    type: 'Port 22 opened to public',
    resource: 'sg-0xf92a1',
    detail: 'Security group rule added: port 22 → 0.0.0.0/0 (all internet)',
    triggered_by: 'user/cloud-guardian-dev',
    ip: '103.21.x.x',
    time: 'Today 3:42pm',
    reverted: true,
    revert_seconds: 4,
    needs_review: false,
    severity: 'critical'
  },
  {
    id: 2,
    type: 'S3 bucket made public',
    resource: 'cloud-guardian-4626',
    detail: 'Bucket ACL changed to public-read — all objects exposed to internet',
    triggered_by: 'user/cloud-guardian-dev',
    ip: '103.21.x.x',
    time: 'Today 1:15pm',
    reverted: true,
    revert_seconds: 7,
    needs_review: false,
    severity: 'critical'
  },
  {
    id: 3,
    type: 'Root account login detected',
    resource: 'AWS Root Account',
    detail: 'Root user signed in via console — root should never be used for daily operations',
    triggered_by: 'root',
    ip: '103.21.x.x',
    time: 'Yesterday 2:00am',
    reverted: false,
    revert_seconds: null,
    needs_review: true,
    severity: 'critical'
  },
  {
    id: 4,
    type: 'Unusual outbound data transfer',
    resource: 'i-0abc123456',
    detail: 'EC2 sent 12GB outbound at 3am with no scheduled job running',
    triggered_by: 'system',
    ip: 'internal',
    time: 'Yesterday 3:12am',
    reverted: false,
    revert_seconds: null,
    needs_review: true,
    severity: 'high'
  },
]

export default function SecurityPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'all' | 'auto-fixed' | 'review'>('all')

  const filtered = securityEvents.filter(e => {
    if (tab === 'auto-fixed') return e.reverted
    if (tab === 'review') return e.needs_review
    return true
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Security events</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {securityEvents.filter(e => e.reverted).length} auto-reverted · {securityEvents.filter(e => e.needs_review).length} need review
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
          🛡 Auto-remediation active
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Auto-reverted', value: '2', sub: 'fixed automatically', color: '#0F6E56', bg: '#E1F5EE' },
          { label: 'Need review', value: '2', sub: 'manual action needed', color: '#A32D2D', bg: '#FCEBEB' },
          { label: 'Avg revert time', value: '5.5s', sub: 'detection to fix', color: '#185FA5', bg: '#E6F1FB' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs text-gray-400 mb-2">{stat.label}</div>
            <div className="text-2xl font-semibold mb-1" style={{color: stat.color}}>{stat.value}</div>
            <div className="text-xs" style={{color: stat.color}}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
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

      {/* Events */}
      <div className="flex flex-col gap-3">
        {filtered.map(event => (
          <div
            key={event.id}
            className="bg-white rounded-xl border shadow-sm p-5"
            style={{
              borderLeft: `3px solid ${event.reverted ? '#0F6E56' : '#A32D2D'}`,
              borderTop: '1px solid #f3f4f6',
              borderRight: '1px solid #f3f4f6',
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{event.type}</span>
                  {event.reverted ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
                      Auto-fixed in {event.revert_seconds}s ✓
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: '#FCEBEB', color: '#A32D2D'}}>
                      Needs review
                    </span>
                  )}
                </div>

                <div className="text-xs text-gray-400 mb-3">
                  {event.resource} · {event.time}
                </div>

                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <div className="text-xs text-gray-700 leading-relaxed mb-2">{event.detail}</div>
                  <div className="flex gap-4">
                    <div className="text-xs text-gray-400">
                      <span className="font-medium text-gray-500">Triggered by:</span> {event.triggered_by}
                    </div>
                    <div className="text-xs text-gray-400">
                      <span className="font-medium text-gray-500">IP:</span> {event.ip}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {event.needs_review && (
                    <button
                      onClick={() => router.push('/agent-ai')}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                      style={{background: '#f0f9f4', color: '#0F6E56', border: '1px solid #a7f3d0'}}
                    >
                      🤖 Ask AI to investigate
                    </button>
                  )}
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                    View CloudTrail log
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}