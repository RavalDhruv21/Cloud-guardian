'use client'
import { useState, useEffect } from 'react'
import { getAuditLogs } from '@/lib/api'

const serviceColor = (service: string) => {
  if (service.includes('lambda')) return { bg: '#E6F1FB', color: '#185FA5' }
  if (service.includes('dynamodb')) return { bg: '#E1F5EE', color: '#0F6E56' }
  if (service.includes('s3')) return { bg: '#FAEEDA', color: '#854F0B' }
  if (service.includes('sns')) return { bg: '#FCEBEB', color: '#A32D2D' }
  if (service.includes('cloudwatch')) return { bg: '#EEEDFE', color: '#3C3489' }
  if (service.includes('apigateway')) return { bg: '#E1F5EE', color: '#0F6E56' }
  return { bg: '#f3f4f6', color: '#6b7280' }
}

const actionIcon = (action: string) => {
  if (action.includes('Invoke') || action.includes('Lambda')) return '⚡'
  if (action.includes('Put') || action.includes('Delete')) return '🗄'
  if (action.includes('S3') || action.includes('Bucket')) return '🪣'
  if (action.includes('Publish') || action.includes('SNS')) return '🔔'
  if (action.includes('AssumeRole') || action.includes('IAM')) return '🔑'
  if (action.includes('GetMetric') || action.includes('CloudWatch')) return '📊'
  if (action.includes('API') || action.includes('Execute')) return '🌐'
  return '📋'
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchLogs()
    window.addEventListener('region-changed', fetchLogs)
    return () => window.removeEventListener('region-changed', fetchLogs)
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAuditLogs()
      setLogs(data.logs || [])
    } catch (err) {
      setError('Failed to load audit logs')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = logs.filter(log => {
    if (filter !== 'all' && !log.service?.toLowerCase().includes(filter)) return false
    if (search && !log.action?.toLowerCase().includes(search.toLowerCase()) &&
        !log.service?.toLowerCase().includes(search.toLowerCase()) &&
        !log.detail?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{borderColor: '#0F6E56', borderTopColor: 'transparent'}}
          />
          <div className="text-xs text-gray-400">Loading CloudTrail events...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Audit log</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Real CloudTrail events from your AWS account
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            Refresh
          </button>
          <div className="text-xs px-3 py-1.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
            {filtered.length} events
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mb-4">
          {error} — Make sure CloudTrail is enabled in your AWS account
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Lambda events', value: logs.filter(l => l.service?.includes('lambda')).length, color: '#185FA5' },
          { label: 'Storage events', value: logs.filter(l => l.service?.includes('dynamodb') || l.service?.includes('s3')).length, color: '#0F6E56' },
          { label: 'API events', value: logs.filter(l => l.service?.includes('apigateway')).length, color: '#854F0B' },
          { label: 'Total events', value: logs.length, color: '#374151' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs text-gray-400 mb-2">{stat.label}</div>
            <div className="text-2xl font-semibold" style={{color: stat.color}}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search actions, services..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 w-56"
        />
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {[
            { key: 'all', label: 'All' },
            { key: 'lambda', label: 'Lambda' },
            { key: 'dynamodb', label: 'DynamoDB' },
            { key: 's3', label: 'S3' },
            { key: 'cloudwatch', label: 'CloudWatch' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="text-xs px-3 py-1.5 rounded-md transition-all"
              style={{
                background: filter === f.key ? '#fff' : 'transparent',
                color: filter === f.key ? '#111' : '#6b7280',
                fontWeight: filter === f.key ? 500 : 400,
                boxShadow: filter === f.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm font-medium text-gray-700 mb-1">No audit logs found</div>
          <div className="text-xs text-gray-400">
            Make sure CloudTrail is enabled in your AWS account and try refreshing
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div
            className="grid text-xs font-medium text-gray-400 px-5 py-3 border-b border-gray-50"
            style={{gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr'}}
          >
            <div>Action</div>
            <div>Detail</div>
            <div>Service</div>
            <div>User</div>
            <div>Time</div>
          </div>

          {filtered.map((log, i) => {
            const colors = serviceColor(log.service || '')
            return (
              <div
                key={log.event_id || i}
                className="grid px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                style={{gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', alignItems: 'center'}}
              >
                <div className="flex items-center gap-2">
                  <span>{actionIcon(log.action || '')}</span>
                  <div>
                    <div className="text-xs font-medium text-gray-800">{log.action}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{background: '#0F6E56'}}/>
                      <span className="text-xs" style={{color: '#0F6E56'}}>success</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 pr-4 leading-relaxed truncate">{log.detail}</div>
                <div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{background: colors.bg, color: colors.color}}
                  >
                    {(log.service || '').replace('.amazonaws.com', '')}
                  </span>
                </div>
                <div className="text-xs text-gray-400 truncate">{log.user}</div>
                <div>
                  <div className="text-xs text-gray-500">
                    {log.time ? new Date(log.time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—'}
                  </div>
                  <div className="text-xs text-gray-300">
                    {log.time ? new Date(log.time).toLocaleDateString() : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="text-xs text-gray-300 text-center mt-4">
        Real CloudTrail events · Filtered to AWS services used by Cloud Guardian
      </div>
    </div>
  )
}