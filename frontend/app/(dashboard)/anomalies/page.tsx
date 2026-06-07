'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAnomalies, resolveAnomaly } from '@/lib/api'

const severityColor = (s: string) => ({
  critical: { bg: '#FCEBEB', color: '#A32D2D', dot: '#A32D2D' },
  high:     { bg: '#FAEEDA', color: '#854F0B', dot: '#854F0B' },
  medium:   { bg: '#FAEEDA', color: '#854F0B', dot: '#854F0B' },
  low:      { bg: '#E6F1FB', color: '#185FA5', dot: '#185FA5' },
}[s] || { bg: '#f3f4f6', color: '#6b7280', dot: '#6b7280' })

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
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"/>
          <div className="text-xs text-gray-400">Loading anomalies...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Anomalies</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {unresolved} unresolved · {anomalies.length} total
          </p>
        </div>
      </div>

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

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-sm font-medium text-gray-700 mb-1">
            {anomalies.length === 0 ? 'No anomalies detected yet' : 'No anomalies match your filter'}
          </div>
          <div className="text-xs text-gray-400">
            {anomalies.length === 0 ? 'AI analysis runs automatically when metrics are collected' : 'Try changing the filter'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((anomaly, i) => {
            const colors = severityColor(anomaly.severity)
            return (
              <div
                key={i}
                className="bg-white rounded-xl border shadow-sm p-5 transition-all"
                style={{
                  borderLeft: `3px solid ${colors.dot}`,
                  borderTop: '1px solid #f3f4f6',
                  borderRight: '1px solid #f3f4f6',
                  borderBottom: '1px solid #f3f4f6',
                  opacity: anomaly.resolved ? 0.6 : 1
                }}
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{background: colors.dot}}/>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{anomaly.summary}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: colors.bg, color: colors.color}}>
                        {anomaly.severity}
                      </span>
                      {anomaly.resolved && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
                          Resolved ✓
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mb-3">
                      {anomaly.instance_id} · {anomaly.timestamp ? new Date(anomaly.timestamp).toLocaleString() : ''}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">Likely cause</div>
                        <div className="text-xs text-gray-700 leading-relaxed">{anomaly.likely_cause || 'Analyzing...'}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">Recommended action</div>
                        <div className="text-xs text-gray-700 leading-relaxed">{anomaly.recommended_action || 'Check instance metrics'}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!anomaly.resolved && (
                        <button
                          onClick={() => handleResolve(anomaly.instance_id, anomaly.timestamp)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          Mark resolved
                        </button>
                      )}
                      <button
                        onClick={() => router.push('/agent-ai')}
                        className="text-xs px-3 py-1.5 rounded-lg"
                        style={{background: '#f0f9f4', color: '#0F6E56', border: '1px solid #a7f3d0'}}
                      >
                        🤖 Ask AI
                      </button>
                      {anomaly.cost_impact && (
                        <span className="text-xs text-gray-400 ml-auto">
                          Cost impact: {anomaly.cost_impact}
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