'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getMetrics, getAnomalies, getCostSuggestions, getSecurityEvents } from '@/lib/api'

export default function DashboardPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<any[]>([])
  const [anomalies, setAnomalies] = useState<any[]>([])
  const [costs, setCosts] = useState<any[]>([])
  const [security, setSecurity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [m, a, c, s] = await Promise.all([
          getMetrics(),
          getAnomalies(),
          getCostSuggestions(),
          getSecurityEvents()
        ])
        setMetrics(m.metrics || [])
        setAnomalies(a.anomalies || [])
        setCosts(c.suggestions || [])
        setSecurity(s.events || [])
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
    // Refresh every 60 seconds
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [])

  const unresolvedAnomalies = anomalies.filter(a => !a.resolved)
  const totalSavings = costs.reduce((sum: number, c: any) => {
    const amt = parseFloat(c.estimated_saving?.replace('$','').replace('/mo','') || '0')
    return sum + amt
  }, 0)

  // Get unique instances from metrics
  const instances = [...new Set(metrics.map(m => m.instance_id))].slice(0, 4)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"/>
          <div className="text-xs text-gray-400">Loading your AWS data...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'EC2 instances', value: instances.length || '—', sub: `${metrics.length} metrics collected`, color: '#0F6E56' },
          { label: 'Anomalies this week', value: unresolvedAnomalies.length || '0', sub: `${anomalies.length} total detected`, color: unresolvedAnomalies.length > 0 ? '#A32D2D' : '#0F6E56' },
          { label: 'Potential savings', value: totalSavings > 0 ? `$${totalSavings.toFixed(0)}` : '$0', sub: `${costs.length} opportunities found`, color: '#854F0B' },
          { label: 'Security events', value: security.length || '0', sub: 'from CloudTrail', color: '#185FA5' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-xs text-gray-400 mb-2">{stat.label}</div>
            <div className="text-2xl font-semibold mb-1" style={{color: stat.color}}>{stat.value}</div>
            <div className="text-xs text-gray-400">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* EC2 instances */}
      {instances.length > 0 ? (
        <>
          <div className="mb-4">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">EC2 Instances — Latest CPU</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {instances.map(instanceId => {
              const instanceMetrics = metrics.filter(m => m.instance_id === instanceId)
              const latest = instanceMetrics[0]
              const cpu = parseFloat(latest?.cpu_avg || 0)
              const status = cpu > 80 ? 'critical' : cpu > 60 ? 'warning' : 'normal'
              const statusColor = status === 'critical' ? '#A32D2D' : status === 'warning' ? '#854F0B' : '#0F6E56'
              const statusBg = status === 'critical' ? '#FCEBEB' : status === 'warning' ? '#FAEEDA' : '#E1F5EE'

              return (
                <div
                  key={instanceId}
                  className="bg-white rounded-xl border shadow-sm p-4"
                  style={{borderLeft: `3px solid ${statusColor}`, borderTop: '1px solid #f3f4f6', borderRight: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6'}}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{instanceId}</div>
                      <div className="text-xs text-gray-400">us-east-1</div>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded-full" style={{background: statusBg, color: statusColor}}>
                      {cpu.toFixed(1)}% CPU
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{width: `${cpu}%`, background: statusColor}}/>
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3">
                    🧠 {cpu > 80 ? 'High CPU detected — check for anomalies' : cpu > 60 ? 'CPU elevated — monitoring closely' : 'All metrics within normal range'}
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                      View details
                    </button>
                    <button
                      onClick={() => router.push('/agent-ai')}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{background: '#f0f9f4', color: '#0F6E56', border: '1px solid #a7f3d0'}}
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center mb-6">
          <div className="text-3xl mb-3">☁️</div>
          <div className="text-sm font-medium text-gray-700 mb-2">No metrics yet</div>
          <div className="text-xs text-gray-400 mb-4">Metrics are collected every 15 minutes. Check back soon or trigger a manual collection.</div>
          <button
            onClick={() => router.push('/connect-aws')}
            className="text-xs px-4 py-2 rounded-lg text-white"
            style={{background: '#0F6E56'}}
          >
            Connect AWS account
          </button>
        </div>
      )}

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent anomalies */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-800">Recent anomalies</h3>
            <span className="text-xs text-gray-400">last 24h</span>
          </div>
          {anomalies.slice(0, 4).length > 0 ? anomalies.slice(0, 4).map((item: any, i: number) => (
            <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
              <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                style={{background: item.severity === 'critical' ? '#A32D2D' : item.severity === 'high' ? '#854F0B' : '#185FA5'}}/>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-800 truncate">{item.summary}</div>
                <div className="text-xs text-gray-400 truncate">{item.instance_id}</div>
              </div>
              <div className="text-xs text-gray-300 flex-shrink-0">{item.severity}</div>
            </div>
          )) : (
            <div className="text-center py-6 text-xs text-gray-400">No anomalies detected ✅</div>
          )}
        </div>

        {/* Cost suggestions */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-800">Cost optimizer</h3>
            {totalSavings > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
                ${totalSavings.toFixed(0)}/mo savings
              </span>
            )}
          </div>
          {costs.slice(0, 3).length > 0 ? costs.slice(0, 3).map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-700 truncate">{item.issue}</div>
                <div className="text-xs text-gray-400 truncate">{item.resource_id}</div>
              </div>
              <div className="text-xs font-medium flex-shrink-0" style={{color: '#0F6E56'}}>{item.estimated_saving}</div>
            </div>
          )) : (
            <div className="text-center py-6 text-xs text-gray-400">No cost issues found ✅</div>
          )}
        </div>
      </div>
    </div>
  )
}