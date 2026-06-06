'use client'
import { useState } from 'react'

const suggestions = [
  { id: 1, type: 'EC2', resource_id: 'i-0def789012', title: 'Idle EC2 instance — 9 days', desc: 'CPU avg 1.2% over 7 days with no inbound traffic. Instance is doing nothing.', instance_type: 't3.large', region: 'us-east-1', saving: '$28/mo', severity: 'high', action: 'Stop instance' },
  { id: 2, type: 'RDS', resource_id: 'db-backup-01', title: 'RDS with zero connections — 4 days', desc: 'Database has had 0 connections for 4 days. No app is using it.', instance_type: 'db.t3.micro', region: 'us-east-1', saving: '$11/mo', severity: 'high', action: 'Stop RDS' },
  { id: 3, type: 'EBS', resource_id: 'vol-001, vol-002', title: '2 unattached EBS volumes', desc: 'Volumes not attached to any instance. Created when EC2 was terminated.', instance_type: '42 GB total', region: 'us-east-1', saving: '$4/mo', severity: 'medium', action: 'Delete volumes' },
  { id: 4, type: 'EIP', resource_id: '54.21.x.x', title: 'Unused Elastic IP', desc: 'Reserved but not attached to any running instance.', instance_type: 'Elastic IP', region: 'us-east-1', saving: '$3.60/mo', severity: 'low', action: 'Release IP' },
]

export default function CostOptimizerPage() {
  const [dismissed, setDismissed] = useState<number[]>([])
  const [stopped, setStopped] = useState<number[]>([])
  const [confirming, setConfirming] = useState<number | null>(null)

  const active = suggestions.filter(s => !dismissed.includes(s.id) && !stopped.includes(s.id))
  const totalSaving = active.reduce((sum, s) => sum + parseFloat(s.saving.replace('$', '').replace('/mo', '')), 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Cost optimizer</h1>
          <p className="text-xs text-gray-400 mt-0.5">Weekly scan — last run today at 9:00am</p>
        </div>
      </div>

      {/* Savings banner */}
      <div className="rounded-xl p-5 mb-6 border" style={{background: 'linear-gradient(135deg, #f0f9f4, #e8f5f0)', borderColor: '#a7f3d0'}}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium mb-1" style={{color: '#0F6E56'}}>Total potential savings</div>
            <div className="text-3xl font-bold" style={{color: '#0F6E56'}}>${totalSaving.toFixed(2)}<span className="text-sm font-normal">/month</span></div>
            <div className="text-xs mt-1" style={{color: '#0F6E56'}}>{active.length} resources identified</div>
          </div>
          <div className="text-5xl">💰</div>
        </div>
      </div>

      {/* Type breakdown */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Idle EC2', count: 1, saving: '$28', color: '#A32D2D', bg: '#FCEBEB' },
          { label: 'Idle RDS', count: 1, saving: '$11', color: '#854F0B', bg: '#FAEEDA' },
          { label: 'Unattached EBS', count: 2, saving: '$4', color: '#854F0B', bg: '#FAEEDA' },
          { label: 'Unused IPs', count: 1, saving: '$3.60', color: '#185FA5', bg: '#E6F1FB' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">{item.label}</div>
            <div className="text-lg font-semibold" style={{color: item.color}}>{item.saving}/mo</div>
            <div className="text-xs text-gray-400">{item.count} resource{item.count > 1 ? 's' : ''}</div>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      <div className="flex flex-col gap-3">
        {active.map(item => (
          <div
            key={item.id}
            className="bg-white rounded-xl border shadow-sm p-5"
            style={{
              borderLeft: `3px solid ${item.severity === 'high' ? '#A32D2D' : item.severity === 'medium' ? '#854F0B' : '#185FA5'}`,
              borderTop: '1px solid #f3f4f6',
              borderRight: '1px solid #f3f4f6',
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
                style={{background: item.type === 'EC2' ? '#FCEBEB' : item.type === 'RDS' ? '#FAEEDA' : '#E6F1FB',
                        color: item.type === 'EC2' ? '#A32D2D' : item.type === 'RDS' ? '#854F0B' : '#185FA5'}}>
                {item.type}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium text-gray-900">{item.title}</div>
                  <div className="text-lg font-bold" style={{color: '#0F6E56'}}>{item.saving}</div>
                </div>
                <div className="text-xs text-gray-400 mb-1">{item.resource_id} · {item.instance_type} · {item.region}</div>
                <div className="text-xs text-gray-600 mb-4 leading-relaxed">{item.desc}</div>

                {confirming === item.id ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <div className="text-xs font-medium text-red-700 mb-2">⚠️ Confirm: {item.action}?</div>
                    <div className="text-xs text-red-600 mb-3">This will stop/remove the resource. You can restart it anytime.</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setStopped(prev => [...prev, item.id]); setConfirming(null) }}
                        className="text-xs px-3 py-1.5 rounded-lg text-white transition-colors"
                        style={{background: '#A32D2D'}}
                      >
                        Yes, {item.action}
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirming(item.id)}
                      className="text-xs px-3 py-1.5 rounded-lg text-white transition-colors"
                      style={{background: '#0F6E56'}}
                    >
                      {item.action}
                    </button>
                    <button
                      onClick={() => setDismissed(prev => [...prev, item.id])}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {active.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-sm font-medium text-gray-700 mb-1">All suggestions resolved</div>
            <div className="text-xs text-gray-400">Next scan runs next Sunday at 9am</div>
          </div>
        )}
      </div>
    </div>
  )
}