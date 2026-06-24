'use client'
import { useState, useEffect } from 'react'
import { getCostSuggestions, dismissSuggestion, stopResource, getToken } from '@/lib/api'

interface ResolvedItem {
  id: string
  issue: string
  saving: number
  action: 'taken' | 'dismissed'
  time: string
  resource_type: string
}

export default function CostOptimizerPage() {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [resolved, setResolved] = useState<ResolvedItem[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [stopped, setStopped] = useState<string[]>([])
  const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const data = await getCostSuggestions()
        setSuggestions(data.suggestions || [])
      } catch (err) {
        console.error('Failed to fetch suggestions:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchSuggestions()
  }, [])

  const handleDismiss = async (resourceId: string) => {
    const item = suggestions.find(s => s.resource_id === resourceId)
    // Add to resolved history
    setResolved(prev => [...prev, {
      id: resourceId,
      issue: item?.issue || resourceId,
      saving: parseFloat(String(item?.saving_per_month || item?.estimated_saving || '0')),
      action: 'dismissed',
      time: new Date().toLocaleTimeString(),
      resource_type: item?.resource_type || 'AWS',
    }])
    try {
      await dismissSuggestion(resourceId)
    } catch {}
    setSuggestions(prev => prev.filter(s => s.resource_id !== resourceId))
  }

  const getConfirmMessage = (item: any) => {
    switch (item.resource_type) {
      case 'EC2':
        if (item.recommendation?.toLowerCase().includes('downsize'))
          return { title: 'Downsize EC2 instance?', msg: `This will stop ${item.resource_id} and resize it to t3.micro. Instance will restart after resize.` }
        return { title: 'Stop EC2 instance?', msg: `This will stop instance ${item.resource_id}. Data is preserved. You can restart it anytime.` }
      case 'EBS':
        return { title: 'Delete EBS volume?', msg: `This will permanently delete volume ${item.resource_id}. Create a snapshot first if you need the data.` }
      case 'ElasticIP':
        return { title: 'Release Elastic IP?', msg: `This will release ${item.resource_id} back to AWS. You will stop being charged immediately.` }
      case 'RDS':
        return { title: 'Stop RDS instance?', msg: `This will stop ${item.resource_id}. Data is preserved. AWS auto-restarts RDS after 7 days.` }
      default:
        return { title: 'Confirm action?', msg: `This will act on ${item.resource_id}. Please verify before proceeding.` }
    }
  }

  const handleStop = async (item: any) => {
    const token = await getToken()
    try {
      let endpoint = ''
      let body: any = { region: item.region || 'us-east-1' }
      switch (item.resource_type) {
        case 'EC2':
          if (item.recommendation?.toLowerCase().includes('downsize')) {
            endpoint = '/ec2/resize'
            body = { ...body, instance_id: item.resource_id, target_type: 't3.micro' }
          } else {
            endpoint = '/ec2/stop'
            body = { ...body, instance_id: item.resource_id }
          }
          break
        case 'EBS':
          endpoint = '/ebs/delete'
          body = { ...body, volume_id: item.resource_id }
          break
        case 'ElasticIP':
          endpoint = '/eip/release'
          body = { ...body, allocation_id: item.resource_id }
          break
        case 'RDS':
          endpoint = '/rds/stop'
          body = { ...body, instance_id: item.resource_id }
          break
      }
      if (endpoint) {
        await fetch(`${API_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        })
      }
    } catch (err) {
      console.error('Action failed:', err)
    }

    // Add to resolved history
    setResolved(prev => [...prev, {
      id: item.resource_id,
      issue: item.issue,
      saving: parseFloat(String(item.saving_per_month || item.estimated_saving || '0')),
      action: 'taken',
      time: new Date().toLocaleTimeString(),
      resource_type: item.resource_type || 'AWS',
    }])
    setStopped(prev => [...prev, item.resource_id])
    setSuggestions(prev => prev.filter(s => s.resource_id !== item.resource_id))
    setConfirming(null)
  }

  const active = suggestions.filter(s => !stopped.includes(s.resource_id))

  // Totals
  const totalIdentified = active.reduce((sum, s) => {
    const raw = s.saving_per_month || s.estimated_saving || '0'
    const amt = parseFloat(String(raw).replace('$', '').replace('/mo', '').replace('/month', ''))
    return sum + (isNaN(amt) ? 0 : amt)
  }, 0) + resolved.reduce((sum, r) => sum + r.saving, 0)

  const totalActioned = resolved
    .filter(r => r.action === 'taken')
    .reduce((sum, r) => sum + r.saving, 0)

  const totalDismissed = resolved
    .filter(r => r.action === 'dismissed')
    .reduce((sum, r) => sum + r.saving, 0)

  const resourceTypeColor = (type: string) => {
    switch (type) {
      case 'EC2': return { bg: 'rgba(248,113,113,0.15)', color: '#F87171', border: 'rgba(248,113,113,0.3)' }
      case 'RDS': return { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24', border: 'rgba(251,191,36,0.3)' }
      case 'EBS': return { bg: 'rgba(96,165,250,0.15)', color: '#60A5FA', border: 'rgba(96,165,250,0.3)' }
      case 'ElasticIP': return { bg: 'rgba(167,139,250,0.15)', color: '#A78BFA', border: 'rgba(167,139,250,0.3)' }
      default: return { bg: 'rgba(96,165,250,0.15)', color: '#60A5FA', border: 'rgba(96,165,250,0.3)' }
    }
  }

  const severityColor = (s: string) =>
    s === 'high' ? '#F87171' : s === 'medium' ? '#FBBF24' : '#60A5FA'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 animate-entrance">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"
            style={{ boxShadow: '0 0 15px rgba(16,185,129,0.2)' }} />
          <div className="text-xs text-white/50">Scanning for cost savings...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-entrance w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Cost optimizer</h1>
          <p className="text-xs text-white/50 mt-0.5">Weekly scan · finds idle and wasted resources</p>
        </div>
      </div>

      {/* Savings banner — 3 columns */}
      <div className="rounded-2xl p-6 mb-8 border transition-all"
        style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,11,24,0.4) 100%)', borderColor: 'rgba(16,185,129,0.2)', boxShadow: '0 4px 20px rgba(16,185,129,0.05)' }}>
        <div className="grid grid-cols-3 gap-6">

          {/* Total identified */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#34D399' }}>
              Total identified
            </div>
            <div className="text-3xl font-bold" style={{ color: '#34D399', textShadow: '0 0 20px rgba(52,211,153,0.3)' }}>
              ${totalIdentified.toFixed(2)}
              <span className="text-sm font-normal ml-1" style={{ color: 'rgba(52,211,153,0.6)' }}>/mo</span>
            </div>
            <div className="text-xs mt-1" style={{ color: 'rgba(52,211,153,0.6)' }}>
              {active.length} still open · ~${(totalIdentified * 12).toFixed(0)}/year
            </div>
          </div>

          {/* Saved by actions */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#60A5FA' }}>
              Saved by actions
            </div>
            <div className="text-3xl font-bold" style={{ color: '#60A5FA', textShadow: '0 0 20px rgba(96,165,250,0.3)' }}>
              ${totalActioned.toFixed(2)}
              <span className="text-sm font-normal ml-1" style={{ color: 'rgba(96,165,250,0.6)' }}>/mo</span>
            </div>
            <div className="text-xs mt-1" style={{ color: 'rgba(96,165,250,0.6)' }}>
              {resolved.filter(r => r.action === 'taken').length} actions taken · ~${(totalActioned * 12).toFixed(0)}/year
            </div>
          </div>

          {/* Dismissed */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#FBBF24' }}>
              Dismissed
            </div>
            <div className="text-3xl font-bold" style={{ color: '#FBBF24', textShadow: '0 0 20px rgba(251,191,36,0.3)' }}>
              ${totalDismissed.toFixed(2)}
              <span className="text-sm font-normal ml-1" style={{ color: 'rgba(251,191,36,0.6)' }}>/mo</span>
            </div>
            <div className="text-xs mt-1" style={{ color: 'rgba(251,191,36,0.6)' }}>
              {resolved.filter(r => r.action === 'dismissed').length} dismissed
            </div>
          </div>

        </div>
      </div>

      {/* Active suggestions */}
      {active.length === 0 && resolved.length === 0 ? (
        <div className="auth-glass rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4 opacity-80" style={{ textShadow: '0 0 20px rgba(52,211,153,0.3)' }}>✅</div>
          <div className="text-sm font-semibold text-white mb-2">No cost issues found</div>
          <div className="text-xs text-white/50">Your AWS resources look well optimized. Next scan runs Sunday at 9am.</div>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="flex flex-col gap-4 mb-8">
              {active.map((item, i) => {
                const typeStyle = resourceTypeColor(item.resource_type)
                const saving = parseFloat(String(item.saving_per_month || item.estimated_saving || '0'))
                return (
                  <div
                    key={i}
                    className="auth-glass rounded-2xl p-5 transition-all hover:scale-[1.01]"
                    style={{ borderLeft: `3px solid ${severityColor(item.severity)}`, animationDelay: `${i * 0.05}s` }}
                  >
                    <div className="flex items-start gap-5">
                      {/* Resource type icon */}
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold shadow-lg"
                        style={{ background: typeStyle.bg, color: typeStyle.color, border: `1px solid ${typeStyle.border}` }}
                      >
                        {item.resource_type || 'AWS'}
                      </div>

                      <div className="flex-1">
                        {/* Header — issue + saving */}
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="text-base font-semibold text-white pr-4">{item.issue}</div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xl font-bold"
                              style={{ color: '#34D399', textShadow: '0 0 10px rgba(52,211,153,0.2)' }}>
                              ${saving.toFixed(2)}
                              <span className="text-xs font-normal ml-1" style={{ color: 'rgba(52,211,153,0.6)' }}>/mo</span>
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                              ~${(saving * 12).toFixed(0)}/year
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="text-xs text-white/40 font-mono">{item.resource_id}</div>
                          {item.timestamp && (
                            <>
                              <div className="text-xs text-white/20">•</div>
                              <div className="text-xs text-white/40">
                                {new Date(item.timestamp).toLocaleString()}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Recommendation */}
                        <div className="rounded-xl p-4 mb-4"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="text-sm text-white/80 leading-relaxed">{item.recommendation}</div>
                        </div>

                        {/* Confirm or action buttons */}
                        {confirming === item.resource_id ? (
                          <div className="rounded-xl p-4 mb-3 border"
                            style={{ background: 'rgba(248,113,113,0.05)', borderColor: 'rgba(248,113,113,0.2)' }}>
                            <div className="text-xs font-semibold text-red-400 mb-2 uppercase tracking-wider">
                              ⚠️ {getConfirmMessage(item).title}
                            </div>
                            <div className="text-sm text-red-300/80 mb-4">{getConfirmMessage(item).msg}</div>
                            <div className="flex gap-3">
                              <button
                                onClick={() => handleStop(item)}
                                className="text-xs font-bold px-4 py-2 rounded-lg text-white shadow-lg transition-all hover:scale-105"
                                style={{ background: 'linear-gradient(135deg, #EF4444, #B91C1C)' }}
                              >
                                Yes, proceed
                              </button>
                              <button
                                onClick={() => setConfirming(null)}
                                className="text-xs font-medium px-4 py-2 rounded-lg border transition-colors hover:bg-white/5"
                                style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <button
                              onClick={() => setConfirming(item.resource_id)}
                              className="text-xs font-bold px-5 py-2.5 rounded-lg text-white shadow-lg transition-all hover:scale-105"
                              style={{ background: 'linear-gradient(135deg, #0F6E56, #094d3c)', boxShadow: '0 4px 15px rgba(15,110,86,0.3)' }}
                            >
                              Take action
                            </button>
                            <button
                              onClick={() => handleDismiss(item.resource_id)}
                              className="text-xs font-medium px-5 py-2.5 rounded-lg border transition-colors hover:bg-white/5"
                              style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Resolved history */}
          {resolved.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                Resolved this session
              </div>
              <div className="flex flex-col gap-2">
                {resolved.map((r, i) => {
                  const typeStyle = resourceTypeColor(r.resource_type)
                  return (
                    <div key={i}
                      className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="flex items-center gap-3">
                        {/* Mini type badge */}
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: typeStyle.bg, color: typeStyle.color }}>
                          {r.resource_type?.slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{r.issue}</div>
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {r.id} · {r.time} · {r.action === 'taken' ? '✅ Action taken' : '❌ Dismissed'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-sm font-bold"
                          style={{ color: r.action === 'taken' ? '#34D399' : '#FBBF24' }}>
                          {r.action === 'taken' ? '+' : '~'}${r.saving.toFixed(2)}/mo
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          ~${(r.saving * 12).toFixed(0)}/year
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}