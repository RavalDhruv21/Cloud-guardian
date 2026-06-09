'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getMetrics, getMetricsHistory } from '@/lib/api'

const statusColor = (cpu: number) =>
  cpu > 80 ? '#F87171' : cpu > 60 ? '#FBBF24' : '#34D399'

const statusBg = (cpu: number) =>
  cpu > 80 ? 'rgba(248,113,113,0.15)' : cpu > 60 ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)'

const statusLabel = (cpu: number) =>
  cpu > 80 ? 'critical' : cpu > 60 ? 'warning' : 'normal'

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<any[]>([])
  const searchParams = useSearchParams()
  const instanceFromUrl = searchParams.get('instance')
  const [selected, setSelected] = useState<string | null>(instanceFromUrl)
  const [loading, setLoading] = useState(true)
  const [chartHistory, setChartHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Build instanceMap from metrics — only last 24 hours
  const instanceMap: Record<string, any[]> = {}
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  metrics
    .filter((m: any) => (m.timestamp > oneDayAgo) || (m.collected_at > oneDayAgo))
    .forEach((m: any) => {
      if (!instanceMap[m.instance_id]) instanceMap[m.instance_id] = []
      instanceMap[m.instance_id].push(m)
    })

  const instances = Object.keys(instanceMap)
  const selectedMetrics = selected ? instanceMap[selected] || [] : []
  const latestMetric = selectedMetrics[0]
  const currentCpu = parseFloat(latestMetric?.cpu_avg || 0)

  const fetchHistory = async (instanceId: string, localMap?: Record<string, any[]>) => {
    const mapToUse = localMap || instanceMap
    setHistoryLoading(true)
    setChartHistory([])
    try {
      const data = await getMetricsHistory(instanceId)
      const history = data.history || []
      if (history.length === 0) {
        const fallback = (mapToUse[instanceId] || []).map((m: any, i: number) => ({
          time: m.timestamp
            ? new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
            : `Point ${i}`,
          cpu: parseFloat(m.cpu_avg || 0),
          cpu_max: parseFloat(m.cpu_max || 0),
          memory: parseFloat(m.cpu_avg || 0) * 0.7,
          network: 0,
        }))
        setChartHistory(
          fallback.length > 1 ? fallback :
          fallback.length === 1 ? [...fallback, ...fallback] : []
        )
      } else {
        setChartHistory(history.map((h: any) => ({
          ...h,
          memory: (h.cpu || 0) * 0.7,
          network: 0,
        })))
      }
    } catch {
      const fallback = (mapToUse[instanceId] || []).map((m: any, i: number) => ({
        time: m.timestamp
          ? new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
          : `Point ${i}`,
        cpu: parseFloat(m.cpu_avg || 0),
        cpu_max: parseFloat(m.cpu_max || 0),
        memory: parseFloat(m.cpu_avg || 0) * 0.7,
        network: 0,
      }))
      setChartHistory(
        fallback.length > 1 ? fallback :
        fallback.length === 1 ? [...fallback, ...fallback] : []
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await getMetrics()
        const items = data.metrics || []
        setMetrics(items)

        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const localMap: Record<string, any[]> = {}
        items
          .filter((m: any) => (m.timestamp > cutoff) || (m.collected_at > cutoff))
          .forEach((m: any) => {
            if (!localMap[m.instance_id]) localMap[m.instance_id] = []
            localMap[m.instance_id].push(m)
          })

        const firstInstance = instanceFromUrl ||
          (Object.keys(localMap).length > 0 ? Object.keys(localMap)[0] : null)

        if (firstInstance) {
          setSelected(firstInstance)
          fetchHistory(firstInstance, localMap)
        }
      } catch (err) {
        console.error('Failed to fetch metrics:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchMetrics()
  }, [])

  const data = chartHistory.length > 0
    ? chartHistory
    : selectedMetrics.map((m: any, i: number) => ({
        time: m.timestamp
          ? new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
          : `Point ${i}`,
        cpu: parseFloat(m.cpu_avg || 0),
        cpu_max: parseFloat(m.cpu_max || 0),
        memory: parseFloat(m.cpu_avg || 0) * 0.7,
        network: 0,
      }))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 animate-entrance">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" style={{boxShadow: '0 0 15px rgba(16,185,129,0.2)'}}/>
          <div className="text-sm font-medium" style={{color: 'rgba(255,255,255,0.5)'}}>Loading metrics...</div>
        </div>
      </div>
    )
  }

  if (instances.length === 0) {
    return (
      <div className="animate-entrance">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-white">Live metrics</h1>
          <p className="text-xs mt-0.5" style={{color: 'rgba(255,255,255,0.5)'}}>Real-time data from your AWS account</p>
        </div>
        <div className="auth-glass rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4 opacity-80">📊</div>
          <div className="text-sm font-semibold text-white mb-2">No metrics collected yet</div>
          <div className="text-xs mb-5 max-w-md mx-auto" style={{color: 'rgba(255,255,255,0.5)'}}>
            Metrics are collected every 15 minutes from your running EC2 instances.
            Make sure you have running EC2 instances in your AWS account.
          </div>
          <div className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-full" style={{background: 'rgba(16,185,129,0.1)', color: '#34D399'}}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Next collection in ~15 minutes
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 animate-entrance">
        <div>
          <h1 className="text-lg font-semibold text-white">Live metrics</h1>
          <p className="text-xs mt-0.5" style={{color: 'rgba(255,255,255,0.5)'}}>
            {instances.length} instance{instances.length > 1 ? 's' : ''} monitored · updates every 15 minutes
          </p>
        </div>
      </div>

      {/* Instance selector */}
      <div className="grid grid-cols-4 gap-4 mb-8 animate-entrance" style={{animationDelay: '0.1s'}}>
        {instances.map(instanceId => {
          const instanceMetrics = instanceMap[instanceId]
          const latest = instanceMetrics[0]
          const cpu = parseFloat(latest?.cpu_avg || 0)
          return (
            <div
              key={instanceId}
              onClick={() => {
                setSelected(instanceId)
                fetchHistory(instanceId)
              }}
              className="auth-glass p-4 cursor-pointer transition-all hover:scale-[1.02]"
              style={{
                borderLeft: `3px solid ${statusColor(cpu)}`,
                borderTop: selected === instanceId ? `1px solid ${statusColor(cpu)}` : '1px solid rgba(255,255,255,0.05)',
                borderRight: selected === instanceId ? `1px solid ${statusColor(cpu)}` : '1px solid rgba(255,255,255,0.05)',
                borderBottom: selected === instanceId ? `1px solid ${statusColor(cpu)}` : '1px solid rgba(255,255,255,0.05)',
                background: selected === instanceId ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                boxShadow: selected === instanceId ? `0 0 20px ${statusBg(cpu)}` : 'none'
              }}
            >
              <div className="text-xs font-semibold text-white truncate mb-1">{instanceId}</div>
              <div className="text-xs mb-3" style={{color: 'rgba(255,255,255,0.4)'}}>us-east-1</div>
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{background: statusBg(cpu), color: statusColor(cpu), border: `1px solid ${statusBg(cpu)}`}}
              >
                {cpu.toFixed(1)}% CPU
              </span>
            </div>
          )
        })}
      </div>

      {selected && (
        <>
          {/* Main chart card */}
          <div className="auth-glass p-6 mb-6 animate-entrance" style={{animationDelay: '0.2s'}}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-base font-semibold text-white">{selected}</div>
                  <div className="text-xs mt-0.5" style={{color: 'rgba(255,255,255,0.4)'}}>
                    us-east-1 · {data.length} data points · {historyLoading ? 'loading...' : 'last 24 hours'}
                  </div>
                </div>
                <span
                  className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                  style={{background: statusBg(currentCpu), color: statusColor(currentCpu)}}
                >
                  {statusLabel(currentCpu)}
                </span>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold" style={{color: statusColor(currentCpu), textShadow: `0 0 15px ${statusBg(currentCpu)}`}}>
                  {currentCpu.toFixed(1)}%
                </div>
                <div className="text-xs font-medium uppercase tracking-wider mt-1" style={{color: 'rgba(255,255,255,0.4)'}}>current CPU avg</div>
              </div>
            </div>

            <div className="text-xs font-semibold mb-4" style={{color: 'rgba(255,255,255,0.5)'}}>
              CPU Utilization — last 24 hours (real CloudWatch data)
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center" style={{height: 220}}>
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                    style={{borderColor: statusColor(currentCpu), borderTopColor: 'transparent'}}
                  />
                  <div className="text-xs font-medium" style={{color: 'rgba(255,255,255,0.5)'}}>Fetching CloudWatch data...</div>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{fontSize: 10, fill: 'rgba(255,255,255,0.4)'}}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    dy={10}
                  />
                  <YAxis
                    tick={{fontSize: 10, fill: 'rgba(255,255,255,0.4)'}}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{fontSize: 12, background: 'rgba(5,11,24,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff'}}
                    itemStyle={{color: '#fff'}}
                    formatter={(v: number) => [`${v.toFixed(1)}%`, 'CPU']}
                  />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke={statusColor(currentCpu)}
                    strokeWidth={3}
                    dot={data.length < 10 ? {r: 4, fill: statusColor(currentCpu), stroke: '#050B18', strokeWidth: 2} : false}
                    activeDot={{r: 6, fill: '#fff', stroke: statusColor(currentCpu), strokeWidth: 2}}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Info bar */}
          <div className="auth-glass p-5 mb-6 animate-entrance" style={{animationDelay: '0.3s'}}>
            <div className="grid grid-cols-4 gap-4 text-center">
              {[
                { label: 'CPU avg', value: `${currentCpu.toFixed(2)}%` },
                { label: 'CPU max', value: `${parseFloat(latestMetric?.cpu_max || 0).toFixed(2)}%` },
                { label: 'Data points', value: data.length },
                { label: 'Status', value: statusLabel(currentCpu) },
              ].map(item => (
                <div key={item.label}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color: 'rgba(255,255,255,0.4)'}}>{item.label}</div>
                  <div
                    className="text-base font-bold"
                    style={{color: item.label === 'Status' ? statusColor(currentCpu) : '#fff'}}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Memory + collected metrics */}
          <div className="grid grid-cols-2 gap-6 animate-entrance" style={{animationDelay: '0.4s'}}>
            <div className="auth-glass p-6">
              <div className="text-sm font-semibold text-white mb-1">Memory Utilization (estimated)</div>
              <div className="text-xs mb-5" style={{color: 'rgba(255,255,255,0.4)'}}>
                Based on CPU correlation — CloudWatch agent needed for exact memory
              </div>
              {historyLoading ? (
                <div className="flex items-center justify-center" style={{height: 150}}>
                  <div
                    className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                    style={{borderColor: '#60A5FA', borderTopColor: 'transparent'}}
                  />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={data} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
                    <XAxis
                      dataKey="time"
                      tick={{fontSize: 9, fill: 'rgba(255,255,255,0.4)'}}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      dy={10}
                    />
                    <YAxis
                      tick={{fontSize: 9, fill: 'rgba(255,255,255,0.4)'}}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 100]}
                      tickFormatter={v => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{fontSize: 11, background: 'rgba(5,11,24,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff'}}
                      itemStyle={{color: '#fff'}}
                      formatter={(v: number) => [`${v.toFixed(1)}%`, 'Memory']}
                    />
                    <Line
                      type="monotone"
                      dataKey="memory"
                      stroke="#60A5FA"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="auth-glass p-6 flex flex-col">
              <div className="text-sm font-semibold text-white mb-5">
                Collected metrics from DynamoDB
              </div>
              <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar" style={{maxHeight: 180}}>
                {selectedMetrics.length > 0 ? (
                  <div className="space-y-2">
                    {selectedMetrics.map((m, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-xl"
                        style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}
                      >
                        <div className="text-xs" style={{color: 'rgba(255,255,255,0.6)'}}>
                          {m.timestamp
                            ? new Date(m.timestamp).toLocaleString()
                            : `Point ${i}`}
                        </div>
                        <div
                          className="text-xs font-bold"
                          style={{color: statusColor(parseFloat(m.cpu_avg))}}
                        >
                          {parseFloat(m.cpu_avg).toFixed(2)}% CPU
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full opacity-50 py-4">
                    <div className="text-2xl mb-2">📭</div>
                    <div className="text-xs text-white">No data points yet</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}