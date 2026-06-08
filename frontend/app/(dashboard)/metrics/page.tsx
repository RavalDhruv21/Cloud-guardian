'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getMetrics, getMetricsHistory } from '@/lib/api'

const statusColor = (cpu: number) =>
  cpu > 80 ? '#A32D2D' : cpu > 60 ? '#854F0B' : '#0F6E56'

const statusBg = (cpu: number) =>
  cpu > 80 ? '#FCEBEB' : cpu > 60 ? '#FAEEDA' : '#E1F5EE'

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

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await getMetrics()
        const items = data.metrics || []
        setMetrics(items)
        const firstInstance = instanceFromUrl || (items.length > 0 ? items[0].instance_id : null)
        if (firstInstance && !selected) {
          setSelected(firstInstance)
          fetchHistory(firstInstance)
        }
      } catch (err) {
        console.error('Failed to fetch metrics:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchMetrics()
  }, [])

  // Group metrics by instance
  const instanceMap: Record<string, any[]> = {}
  metrics.forEach(m => {
    if (!instanceMap[m.instance_id]) instanceMap[m.instance_id] = []
    instanceMap[m.instance_id].push(m)
  })

  const instances = Object.keys(instanceMap)
  const selectedMetrics = selected ? instanceMap[selected] || [] : []

  // Build chart data from real metrics
  const chartData = selectedMetrics.map((m, i) => ({
    time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : `Point ${i}`,
    cpu: parseFloat(m.cpu_avg || 0),
    memory: parseFloat(m.cpu_avg || 0) * 0.7,
    network: Math.random() * 30,
  }))

  // If only one data point, duplicate it for chart to render
  if (chartData.length === 1) {
    chartData.unshift({...chartData[0], time: 'earlier'})
  }

  const latestMetric = selectedMetrics[0]
  const currentCpu = parseFloat(latestMetric?.cpu_avg || 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"/>
          <div className="text-xs text-gray-400">Loading metrics...</div>
        </div>
      </div>
    )
  }

  if (instances.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Live metrics</h1>
          <p className="text-xs text-gray-400 mt-0.5">Real-time data from your AWS account</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <div className="text-sm font-medium text-gray-700 mb-2">No metrics collected yet</div>
          <div className="text-xs text-gray-400 mb-4">
            Metrics are collected every 15 minutes from your running EC2 instances.
            Make sure you have running EC2 instances in your AWS account.
          </div>
          <div className="text-xs text-gray-300">Next collection in ~15 minutes</div>
        </div>
      </div>
    )
  }

const fetchHistory = async (instanceId: string) => {
  setHistoryLoading(true)
  try {
    const data = await getMetricsHistory(instanceId)
    const history = data.history || []
    
    // If only one point or empty, show what we have from DynamoDB
    if (history.length === 0) {
      const instanceMetrics = instanceMap[instanceId] || []
      const fallback = instanceMetrics.map((m: any, i: number) => ({
        time: m.timestamp
          ? new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
          : `Point ${i}`,
        cpu: parseFloat(m.cpu_avg || 0),
        cpu_max: parseFloat(m.cpu_max || 0),
      }))
      setChartHistory(fallback.length > 1 ? fallback : [...fallback, ...fallback])
    } else {
      setChartHistory(history)
    }
  } catch (err) {
    // Fallback to DynamoDB data
    const instanceMetrics = instanceMap[instanceId] || []
    const fallback = instanceMetrics.map((m: any, i: number) => ({
      time: new Date(m.timestamp || '').toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
      cpu: parseFloat(m.cpu_avg || 0),
      cpu_max: parseFloat(m.cpu_max || 0),
    }))
    setChartHistory(fallback.length > 1 ? fallback : [...fallback, ...fallback])
  } finally {
    setHistoryLoading(false)
  }
}

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Live metrics</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {instances.length} instance{instances.length > 1 ? 's' : ''} monitored · updates every 15 minutes
          </p>
        </div>
      </div>

      {/* Instance selector */}
      <div className="grid grid-cols-4 gap-3 mb-6">
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
              className="bg-white rounded-xl border shadow-sm p-3 cursor-pointer transition-all hover:shadow-md"
              style={{
                borderLeft: `3px solid ${statusColor(cpu)}`,
                borderTop: selected === instanceId ? `2px solid ${statusColor(cpu)}` : '1px solid #f3f4f6',
                borderRight: selected === instanceId ? `2px solid ${statusColor(cpu)}` : '1px solid #f3f4f6',
                borderBottom: selected === instanceId ? `2px solid ${statusColor(cpu)}` : '1px solid #f3f4f6',
              }}
            >
              <div className="text-xs font-medium text-gray-800 truncate mb-0.5">{instanceId}</div>
              <div className="text-xs text-gray-400 mb-2">us-east-1</div>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{background: statusBg(cpu), color: statusColor(cpu)}}
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
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{selected}</div>
                  <div className="text-xs text-gray-400">us-east-1 · {selectedMetrics.length} data point{selectedMetrics.length > 1 ? 's' : ''} collected</div>
                </div>
                <span
                  className="text-xs font-medium px-2 py-1 rounded-full"
                  style={{background: statusBg(currentCpu), color: statusColor(currentCpu)}}
                >
                  {statusLabel(currentCpu)}
                </span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold" style={{color: statusColor(currentCpu)}}>
                  {currentCpu.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-400">current CPU avg</div>
              </div>
            </div>

            <div className="text-xs font-medium text-gray-500 mb-3">CPU Utilization — collected data points</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
                <XAxis dataKey="time" tick={{fontSize: 10}} tickLine={false} axisLine={false}/>
                <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`}/>
                <Tooltip
                  contentStyle={{fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 8}}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, 'CPU']}
                />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  stroke={statusColor(currentCpu)}
                  strokeWidth={2}
                  dot={{r: 4, fill: statusColor(currentCpu)}}
                  activeDot={{r: 6}}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Info bar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
            <div className="grid grid-cols-4 gap-4 text-center">
              {[
                { label: 'CPU avg', value: `${currentCpu.toFixed(2)}%` },
                { label: 'CPU max', value: `${parseFloat(latestMetric?.cpu_max || 0).toFixed(2)}%` },
                { label: 'Data points', value: selectedMetrics.length },
                { label: 'Status', value: statusLabel(currentCpu) },
              ].map(item => (
                <div key={item.label}>
                  <div className="text-xs text-gray-400 mb-1">{item.label}</div>
                  <div
                    className="text-xs font-medium"
                    style={{color: item.label === 'Status' ? statusColor(currentCpu) : '#374151'}}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Memory + Network */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="text-xs font-medium text-gray-500 mb-1">Memory Utilization (estimated)</div>
              <div className="text-xs text-gray-300 mb-3">Based on CPU correlation — CloudWatch agent needed for exact memory</div>
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
                  <XAxis dataKey="time" tick={{fontSize: 9}} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fontSize: 9}} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`}/>
                  <Tooltip contentStyle={{fontSize: 10, borderRadius: 8}} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Memory']}/>
                  <Line type="monotone" dataKey="memory" stroke="#185FA5" strokeWidth={1.5} dot={{r: 3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="text-xs font-medium text-gray-500 mb-3">All collected metrics</div>
              <div className="overflow-y-auto" style={{maxHeight: 150}}>
                {selectedMetrics.map((m, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div className="text-xs text-gray-400">
                      {m.timestamp ? new Date(m.timestamp).toLocaleString() : `Point ${i}`}
                    </div>
                    <div className="text-xs font-medium" style={{color: statusColor(parseFloat(m.cpu_avg))}}>
                      {parseFloat(m.cpu_avg).toFixed(2)}% CPU
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}