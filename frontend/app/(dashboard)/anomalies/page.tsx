'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const anomalies = [
  { id: 1, instance_id: 'i-0abc123456', severity: 'critical', summary: 'CPU at 94% for 3hrs with zero inbound traffic', likely_cause: 'Cryptominer or runaway background process consuming all CPU resources', recommended_action: 'SSH into instance, run htop, identify and kill suspicious process', cost_impact: '$15 extra compute this month', time: '2 mins ago', resolved: false },
  { id: 2, instance_id: 'db-prod-01', severity: 'medium', summary: 'RDS instance with zero connections for 3 days', likely_cause: 'Application disconnected or database no longer in use', recommended_action: 'Stop the RDS instance to save $18/month. Restart anytime if needed', cost_impact: '$18/month wasted', time: '1 hour ago', resolved: false },
  { id: 3, instance_id: 'sg-0xf92a1', severity: 'critical', summary: 'Port 22 opened to 0.0.0.0/0 — auto-reverted', likely_cause: 'Accidental security group misconfiguration', recommended_action: 'No action needed — auto-reverted in 4 seconds. Review who made the change', cost_impact: 'No cost impact', time: '3 hours ago', resolved: true },
  { id: 4, instance_id: 'billing', severity: 'high', summary: 'Daily bill spike — $47 today vs $5 average', likely_cause: 'NAT Gateway processed unusually high data transfer volume', recommended_action: 'Review NAT Gateway usage, check for unexpected data transfers', cost_impact: '$42 unexpected charge today', time: '6 hours ago', resolved: false },
  { id: 5, instance_id: 'i-0ghi789012', severity: 'medium', summary: 'CPU trending upward — 78% and rising', likely_cause: 'Increasing traffic load or memory leak causing CPU pressure', recommended_action: 'Monitor for next 30 minutes. If continues, consider scaling up', cost_impact: 'Minimal if resolved quickly', time: '8 hours ago', resolved: false },
]

const severityColor = (s: string) => ({
  critical: { bg: '#FCEBEB', color: '#A32D2D', dot: '#A32D2D' },
  high:     { bg: '#FAEEDA', color: '#854F0B', dot: '#854F0B' },
  medium:   { bg: '#FAEEDA', color: '#854F0B', dot: '#854F0B' },
  low:      { bg: '#E6F1FB', color: '#185FA5', dot: '#185FA5' },
}[s] || { bg: '#f3f4f6', color: '#6b7280', dot: '#6b7280' })

export default function AnomaliesPage() {
  const router = useRouter()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [resolved, setResolved] = useState<number[]>([3])

  const filtered = anomalies.filter(a => {
    if (filter === 'unresolved' && resolved.includes(a.id)) return false
    if (filter === 'resolved' && !resolved.includes(a.id)) return false
    if (filter === 'critical' && a.severity !== 'critical') return false
    if (search && !a.instance_id.toLowerCase().includes(search.toLowerCase()) && !a.summary.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Anomalies</h1>
          <p className="text-xs text-gray-400 mt-0.5">{anomalies.filter(a => !resolved.includes(a.id)).length} unresolved · {anomalies.length} total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by instance ID or keyword..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 w-64"
        />
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {['all', 'unresolved', 'resolved', 'critical'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs px-3 py-1.5 rounded-md capitalize transition-all"
              style={{
                background: filter === f ? '#fff' : 'transparent',
                color: filter === f ? '#111' : '#6b7280',
                fontWeight: filter === f ? 500 : 400,
                boxShadow: filter === f ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Anomaly cards */}
      <div className="flex flex-col gap-3">
        {filtered.map(anomaly => {
          const isResolved = resolved.includes(anomaly.id)
          const colors = severityColor(anomaly.severity)
          return (
            <div
              key={anomaly.id}
              className="bg-white rounded-xl border shadow-sm p-5 transition-all"
              style={{
                borderLeft: `3px solid ${colors.dot}`,
                borderTop: '1px solid #f3f4f6',
                borderRight: '1px solid #f3f4f6',
                borderBottom: '1px solid #f3f4f6',
                opacity: isResolved ? 0.6 : 1
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{background: colors.dot}}/>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{anomaly.summary}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: colors.bg, color: colors.color}}>
                        {anomaly.severity}
                      </span>
                      {isResolved && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
                          Resolved ✓
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mb-3">
                      {anomaly.instance_id} · {anomaly.time}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">Likely cause</div>
                        <div className="text-xs text-gray-700 leading-relaxed">{anomaly.likely_cause}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">Recommended action</div>
                        <div className="text-xs text-gray-700 leading-relaxed">{anomaly.recommended_action}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isResolved && (
                        <button
                          onClick={() => setResolved(prev => [...prev, anomaly.id])}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Mark resolved
                        </button>
                      )}
                      <button
                        onClick={() => router.push('/agent-ai')}
                        className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                        style={{background: '#f0f9f4', color: '#0F6E56', border: '1px solid #a7f3d0'}}
                      >
                        🤖 Ask AI
                      </button>
                      <span className="text-xs text-gray-400 ml-auto">
                        Cost impact: {anomaly.cost_impact}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}