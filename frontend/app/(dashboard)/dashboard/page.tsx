export default function DashboardPage() {
  return (
    <div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'EC2 instances', value: '4', sub: '3 healthy · 1 critical', color: '#0F6E56' },
          { label: 'Anomalies this week', value: '7', sub: '2 critical · 5 medium', color: '#A32D2D' },
          { label: 'Potential savings', value: '$43', sub: 'per month identified', color: '#854F0B' },
          { label: 'Security events', value: '2', sub: 'both auto-reverted', color: '#185FA5' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-xs text-gray-400 mb-2">{stat.label}</div>
            <div className="text-2xl font-semibold mb-1" style={{color: stat.color}}>{stat.value}</div>
            <div className="text-xs text-gray-400">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* EC2 grid */}
      <div className="mb-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">EC2 Instances — CPU utilization</h2>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { id: 'i-0abc123456', type: 't3.large', cpu: 94, status: 'critical', ai: 'CPU sustained 3hrs, zero inbound — likely cryptominer or runaway process' },
          { id: 'i-0def456789', type: 't3.micro', cpu: 3, status: 'normal', ai: 'All metrics within normal range — no anomalies detected' },
          { id: 'i-0ghi789012', type: 'm5.xlarge', cpu: 78, status: 'warning', ai: 'CPU trending upward over 4hrs — monitor closely' },
          { id: 'i-0jkl012345', type: 't3.medium', cpu: 12, status: 'normal', ai: 'Stable and healthy — consistent with web server workload' },
        ].map((instance) => (
          <div
            key={instance.id}
            className="bg-white rounded-xl border shadow-sm p-4"
            style={{
              borderLeft: `3px solid ${instance.status === 'critical' ? '#A32D2D' : instance.status === 'warning' ? '#854F0B' : '#0F6E56'}`,
              borderTop: '1px solid #f3f4f6',
              borderRight: '1px solid #f3f4f6',
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium text-gray-800">{instance.id}</div>
                <div className="text-xs text-gray-400">{instance.type} · us-east-1</div>
              </div>
              <span
                className="text-xs font-medium px-2 py-1 rounded-full"
                style={{
                  background: instance.status === 'critical' ? '#FCEBEB' : instance.status === 'warning' ? '#FAEEDA' : '#E1F5EE',
                  color: instance.status === 'critical' ? '#A32D2D' : instance.status === 'warning' ? '#854F0B' : '#0F6E56',
                }}
              >
                {instance.cpu}% CPU
              </span>
            </div>

            {/* Simple CPU bar */}
            <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${instance.cpu}%`,
                  background: instance.status === 'critical' ? '#A32D2D' : instance.status === 'warning' ? '#854F0B' : '#0F6E56'
                }}
              />
            </div>

            {/* AI summary */}
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3 leading-relaxed">
              🧠 {instance.ai}
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                View details
              </button>
              <button
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{background: '#f0f9f4', color: '#0F6E56', border: '1px solid #a7f3d0'}}
              >
                🤖 Ask AI
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-4">

        {/* Recent anomalies */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-800">Recent anomalies</h3>
            <span className="text-xs text-gray-400">last 24h</span>
          </div>
          {[
            { title: 'High CPU — i-0abc123456', desc: '94% avg · zero inbound · 3hr', severity: 'critical', time: '2m ago' },
            { title: 'RDS zero connections', desc: '0 connections · 3 days · db-prod', severity: 'medium', time: '1h ago' },
            { title: 'Port 22 open — sg-0xf92a1', desc: 'Auto-reverted in 4 seconds', severity: 'critical', time: '3h ago' },
            { title: 'Bill spike — $47 today', desc: 'Normal avg: $5 · NAT Gateway', severity: 'info', time: '6h ago' },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
              <div
                className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                style={{background: item.severity === 'critical' ? '#A32D2D' : item.severity === 'medium' ? '#854F0B' : '#185FA5'}}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-800 truncate">{item.title}</div>
                <div className="text-xs text-gray-400 truncate">{item.desc}</div>
              </div>
              <div className="text-xs text-gray-300 flex-shrink-0">{item.time}</div>
            </div>
          ))}
        </div>

        {/* Cost + Security */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-800">Cost optimizer</h3>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>$43/mo savings</span>
            </div>
            {[
              { resource: 'EC2 i-0def789 — idle 9 days', saving: '$28/mo', severity: 'high' },
              { resource: 'RDS db-backup — 0 connections', saving: '$11/mo', severity: 'medium' },
              { resource: '2 unattached EBS volumes', saving: '$4/mo', severity: 'medium' },
            ].map((item) => (
              <div key={item.resource} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-700 truncate">{item.resource}</div>
                </div>
                <div className="text-xs font-medium flex-shrink-0" style={{color: '#0F6E56'}}>{item.saving}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-800">Security events</h3>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>All clear</span>
            </div>
            {[
              { event: 'Port 22 → 0.0.0.0/0 opened', status: 'Auto-fixed', time: '3:42pm' },
              { event: 'S3 bucket made public', status: 'Auto-fixed', time: '1:15pm' },
              { event: 'Root account login', status: 'Review', time: 'Yesterday' },
            ].map((item) => (
              <div key={item.event} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-700 truncate">{item.event}</div>
                  <div className="text-xs text-gray-400">{item.time}</div>
                </div>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: item.status === 'Auto-fixed' ? '#E1F5EE' : '#FCEBEB',
                    color: item.status === 'Auto-fixed' ? '#0F6E56' : '#A32D2D'
                  }}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}