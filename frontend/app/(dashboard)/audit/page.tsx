'use client'
import { useState, useEffect } from 'react'
import { getAuditLogs } from '@/lib/api'

const serviceColor = (service: string) => {
  if (service.includes('lambda')) return { bg: 'rgba(96,165,250,0.15)', color: '#60A5FA' }
  if (service.includes('dynamodb')) return { bg: 'rgba(52,211,153,0.15)', color: '#34D399' }
  if (service.includes('s3')) return { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' }
  if (service.includes('sns')) return { bg: 'rgba(248,113,113,0.15)', color: '#F87171' }
  if (service.includes('cloudwatch')) return { bg: 'rgba(167,139,250,0.15)', color: '#A78BFA' }
  if (service.includes('apigateway')) return { bg: 'rgba(52,211,153,0.15)', color: '#34D399' }
  return { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }
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
      <div className="flex items-center justify-center h-64 animate-entrance">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" style={{boxShadow: '0 0 15px rgba(16,185,129,0.2)'}}/>
          <div className="text-xs text-white/50">Loading CloudTrail events...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-entrance w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Audit log</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Real CloudTrail events from your AWS account
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchLogs}
            className="text-xs font-medium px-4 py-2 rounded-full border transition-colors hover:bg-white/10"
            style={{borderColor: 'rgba(255,255,255,0.1)', color: '#fff'}}
          >
            Refresh
          </button>
          <div className="text-xs font-bold px-4 py-2 rounded-full" style={{background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)'}}>
            {filtered.length} events
          </div>
        </div>
      </div>

      {error && (
        <div className="border rounded-xl px-5 py-4 text-sm text-red-400 mb-6" style={{background: 'rgba(248,113,113,0.05)', borderColor: 'rgba(248,113,113,0.2)'}}>
          {error} — Make sure CloudTrail is enabled in your AWS account
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        {[
          { label: 'Lambda events', value: logs.filter(l => l.service?.includes('lambda')).length, color: '#60A5FA', glow: 'rgba(96,165,250,0.15)' },
          { label: 'Storage events', value: logs.filter(l => l.service?.includes('dynamodb') || l.service?.includes('s3')).length, color: '#34D399', glow: 'rgba(52,211,153,0.15)' },
          { label: 'API events', value: logs.filter(l => l.service?.includes('apigateway')).length, color: '#FBBF24', glow: 'rgba(251,191,36,0.15)' },
          { label: 'Total events', value: logs.length, color: '#fff', glow: 'rgba(255,255,255,0.1)' },
        ].map((stat, i) => (
          <div key={stat.label} className="auth-glass rounded-2xl p-5" style={{animationDelay: `${i * 0.1}s`}}>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">{stat.label}</div>
            <div className="text-3xl font-bold" style={{color: stat.color, textShadow: `0 0 15px ${stat.glow}`}}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <input
          type="text"
          placeholder="Search actions, services..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-xs px-4 py-2.5 rounded-xl focus:outline-none transition-colors w-64"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff'
          }}
          onFocus={e => e.currentTarget.style.borderColor = '#0F6E56'}
          onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
        />
        <div className="flex gap-1 p-1 rounded-xl" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
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
              className="text-xs px-4 py-1.5 rounded-lg transition-all"
              style={{
                background: filter === f.key ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: filter === f.key ? '#fff' : 'rgba(255,255,255,0.5)',
                fontWeight: filter === f.key ? 600 : 400,
                boxShadow: filter === f.key ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      {filtered.length === 0 ? (
        <div className="auth-glass rounded-2xl p-12 text-center mt-4">
          <div className="text-4xl mb-4 opacity-50" style={{textShadow: '0 0 20px rgba(255,255,255,0.2)'}}>📋</div>
          <div className="text-sm font-semibold text-white mb-2">No audit logs found</div>
          <div className="text-xs text-white/50">
            Make sure CloudTrail is enabled in your AWS account and try refreshing
          </div>
        </div>
      ) : (
        <div className="auth-glass rounded-2xl overflow-hidden mt-4">
          <div
            className="grid text-xs font-semibold uppercase tracking-wider px-6 py-4"
            style={{gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)'}}
          >
            <div>Action</div>
            <div>Detail</div>
            <div>Service</div>
            <div>User</div>
            <div>Time</div>
          </div>

          <div className="flex flex-col">
            {filtered.map((log, i) => {
              const colors = serviceColor(log.service || '')
              return (
                <div
                  key={log.event_id || i}
                  className="grid px-6 py-4 transition-colors hover:bg-white/5"
                  style={{gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', alignItems: 'center', borderBottom: i === filtered.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.02)'}}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base opacity-80">{actionIcon(log.action || '')}</span>
                    <div>
                      <div className="text-sm font-semibold text-white/90">{log.action}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]"/>
                        <span className="text-xs font-medium" style={{color: '#34D399'}}>success</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-white/60 pr-6 leading-relaxed truncate">{log.detail}</div>
                  <div>
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider"
                      style={{background: colors.bg, color: colors.color, border: `1px solid ${colors.bg}`}}
                    >
                      {(log.service || '').replace('.amazonaws.com', '')}
                    </span>
                  </div>
                  <div className="text-xs text-white/50 truncate pr-4 font-mono">{log.user}</div>
                  <div>
                    <div className="text-sm font-medium text-white/80">
                      {log.time ? new Date(log.time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—'}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      {log.time ? new Date(log.time).toLocaleDateString() : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="text-xs font-medium text-center mt-6" style={{color: 'rgba(255,255,255,0.3)'}}>
        Real CloudTrail events · Filtered to AWS services used by Cloud Guardian
      </div>
    </div>
  )
}