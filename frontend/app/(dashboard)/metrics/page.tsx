'use client'
import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const instances = [
  { id: 'i-0abc123456', type: 't3.large', status: 'critical', az: 'us-east-1a' },
  { id: 'i-0def456789', type: 't3.micro', status: 'normal', az: 'us-east-1b' },
  { id: 'i-0ghi789012', type: 'm5.xlarge', status: 'warning', az: 'us-east-1a' },
  { id: 'i-0jkl012345', type: 't3.medium', status: 'normal', az: 'us-east-1c' },
]

const generateData = (base: number, variance: number) =>
  Array.from({length: 24}, (_, i) => ({
    time: `${String(i).padStart(2,'0')}:00`,
    cpu: Math.max(0, Math.min(100, base + (Math.random() - 0.5) * variance)),
    network: Math.max(0, Math.random() * 50),
    memory: Math.max(0, Math.min(100, base * 0.7 + (Math.random() - 0.5) * 10)),
  }))

const metricsData: Record<string, ReturnType<typeof generateData>> = {
  'i-0abc123456': generateData(90, 15),
  'i-0def456789': generateData(5, 8),
  'i-0ghi789012': generateData(72, 20),
  'i-0jkl012345': generateData(15, 10),
}

const statusColor = (s: string) => s === 'critical' ? '#A32D2D' : s === 'warning' ? '#854F0B' : '#0F6E56'
const statusBg = (s: string) => s === 'critical' ? '#FCEBEB' : s === 'warning' ? '#FAEEDA' : '#E1F5EE'

export default function MetricsPage() {
  const [selected, setSelected] = useState('i-0abc123456')
  const data = metricsData[selected]
  const instance = instances.find(i => i.id === selected)!
  const currentCpu = Math.round(data[data.length - 1].cpu)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Live metrics</h1>
          <p className="text-xs text-gray-400 mt-0.5">Last 24 hours · updates every 15 minutes</p>
        </div>
      </div>

      {/* Instance selector */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {instances.map(inst => (
          <div
            key={inst.id}
            onClick={() => setSelected(inst.id)}
            className="bg-white rounded-xl border shadow-sm p-3 cursor-pointer transition-all"
            style={{
              borderColor: selected === inst.id ? statusColor(inst.status) : '#f3f4f6',
              borderWidth: selected === inst.id ? 2 : 1,
              borderLeft: `3px solid ${statusColor(inst.status)}`
            }}
          >
            <div className="text-xs font-medium text-gray-800 truncate">{inst.id}</div>
            <div className="text-xs text-gray-400 mb-2">{inst.type}</div>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{background: statusBg(inst.status), color: statusColor(inst.status)}}
            >
              {Math.round(metricsData[inst.id][23].cpu)}% CPU
            </span>
          </div>
        ))}
      </div>

      {/* Instance detail */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">{instance.id}</div>
              <div className="text-xs text-gray-400">{instance.type} · {instance.az}</div>
            </div>
            <span
              className="text-xs font-medium px-2 py-1 rounded-full"
              style={{background: statusBg(instance.status), color: statusColor(instance.status)}}
            >
              {instance.status}
            </span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{color: statusColor(instance.status)}}>{currentCpu}%</div>
            <div className="text-xs text-gray-400">current CPU</div>
          </div>
        </div>

        {/* CPU Chart */}
        <div className="mb-2">
          <div className="text-xs font-medium text-gray-500 mb-3">CPU Utilization — last 24 hours</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
              <XAxis dataKey="time" tick={{fontSize: 10}} tickLine={false} axisLine={false} interval={3}/>
              <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`}/>
              <Tooltip
                contentStyle={{fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 8}}
                formatter={(v: number) => [`${Math.round(v)}%`, 'CPU']}
              />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke={statusColor(instance.status)}
                strokeWidth={2}
                dot={false}
                activeDot={{r: 4}}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Memory + Network charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="text-xs font-medium text-gray-500 mb-3">Memory Utilization</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
              <XAxis dataKey="time" tick={{fontSize: 9}} tickLine={false} axisLine={false} interval={5}/>
              <YAxis tick={{fontSize: 9}} tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={v => `${v}%`}/>
              <Tooltip contentStyle={{fontSize: 10, borderRadius: 8}} formatter={(v: number) => [`${Math.round(v)}%`, 'Memory']}/>
              <Line type="monotone" dataKey="memory" stroke="#185FA5" strokeWidth={1.5} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="text-xs font-medium text-gray-500 mb-3">Network In/Out (MB)</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
              <XAxis dataKey="time" tick={{fontSize: 9}} tickLine={false} axisLine={false} interval={5}/>
              <YAxis tick={{fontSize: 9}} tickLine={false} axisLine={false} tickFormatter={v => `${v}MB`}/>
              <Tooltip contentStyle={{fontSize: 10, borderRadius: 8}} formatter={(v: number) => [`${Math.round(v)} MB`, 'Network']}/>
              <Line type="monotone" dataKey="network" stroke="#854F0B" strokeWidth={1.5} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}