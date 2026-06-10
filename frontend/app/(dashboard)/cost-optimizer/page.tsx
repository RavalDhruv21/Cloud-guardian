'use client'
import { useState, useEffect } from 'react'
import { getCostSuggestions, dismissSuggestion } from '@/lib/api'

export default function CostOptimizerPage() {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
    try {
      await dismissSuggestion(resourceId)
      setSuggestions(prev => prev.filter(s => s.resource_id !== resourceId))
    } catch (err) {
      setSuggestions(prev => prev.filter(s => s.resource_id !== resourceId))
    }
  }

  const getConfirmMessage = (item: any) => {
    switch (item.resource_type) {
      case 'EC2':
        if (item.recommendation?.toLowerCase().includes('downsize'))
          return { title: 'Downsize EC2 instance?', msg: `This will stop i ${item.resource_id} and resize it to t3.micro. Instance will restart after resize.` }
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
    const token = localStorage.getItem('cg_token') || ''

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

    // Remove from UI regardless
    setStopped(prev => [...prev, item.resource_id])
    setSuggestions(prev => prev.filter(s => s.resource_id !== item.resource_id))
    setConfirming(null)
  }

  const active = suggestions.filter(s => !stopped.includes(s.resource_id))

  const totalSavings = active.reduce((sum, s) => {
    // Try both field names
    const raw = s.saving_per_month || s.estimated_saving || '0'
    const amt = parseFloat(String(raw).replace('$','').replace('/mo','').replace('/month',''))
    return sum + (isNaN(amt) ? 0 : amt)
  }, 0)

  const severityColor = (s: string) =>
    s === 'high' ? '#F87171' : s === 'medium' ? '#FBBF24' : '#60A5FA'

  const severityBg = (s: string) =>
    s === 'high' ? 'rgba(248,113,113,0.15)' : s === 'medium' ? 'rgba(251,191,36,0.15)' : 'rgba(96,165,250,0.15)'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 animate-entrance">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" style={{boxShadow: '0 0 15px rgba(16,185,129,0.2)'}}/>
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

      {/* Savings banner */}
      <div className="rounded-2xl p-6 mb-8 border transition-all" style={{background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,11,24,0.4) 100%)', borderColor: 'rgba(16,185,129,0.2)', boxShadow: '0 4px 20px rgba(16,185,129,0.05)'}}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color: '#34D399'}}>Total potential savings</div>
            <div className="text-4xl font-bold" style={{color: '#34D399', textShadow: '0 0 20px rgba(52,211,153,0.3)'}}>
              ${totalSavings.toFixed(2)}<span className="text-base font-normal text-emerald-500/60 ml-1">/month</span>
            </div>
            <div className="text-xs mt-2" style={{color: 'rgba(52,211,153,0.6)'}}>{active.length} resources identified</div>
          </div>
          <div className="text-6xl opacity-80" style={{textShadow: '0 0 30px rgba(52,211,153,0.3)'}}>💰</div>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="auth-glass rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4 opacity-80" style={{textShadow: '0 0 20px rgba(52,211,153,0.3)'}}>✅</div>
          <div className="text-sm font-semibold text-white mb-2">
            {suggestions.length === 0 ? 'No cost issues found' : 'All suggestions resolved'}
          </div>
          <div className="text-xs text-white/50">
            {suggestions.length === 0
              ? 'Your AWS resources look well optimized. Next scan runs Sunday at 9am.'
              : 'Great work! Next scan runs Sunday at 9am.'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {active.map((item, i) => (
            <div
              key={i}
              className="auth-glass rounded-2xl p-5 transition-all hover:scale-[1.01]"
              style={{
                borderLeft: `3px solid ${severityColor(item.severity)}`,
                animationDelay: `${i * 0.05}s`
              }}
            >
              <div className="flex items-start gap-5">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold shadow-lg"
                  style={{
                    background: item.resource_type === 'EC2' ? 'rgba(248,113,113,0.15)' : item.resource_type === 'RDS' ? 'rgba(251,191,36,0.15)' : 'rgba(96,165,250,0.15)',
                    color: item.resource_type === 'EC2' ? '#F87171' : item.resource_type === 'RDS' ? '#FBBF24' : '#60A5FA',
                    border: `1px solid ${item.resource_type === 'EC2' ? 'rgba(248,113,113,0.3)' : item.resource_type === 'RDS' ? 'rgba(251,191,36,0.3)' : 'rgba(96,165,250,0.3)'}`
                  }}
                >
                  {item.resource_type || 'AWS'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-base font-semibold text-white">{item.issue}</div>
                    <div className="text-xl font-bold" style={{color: '#34D399', textShadow: '0 0 10px rgba(52,211,153,0.2)'}}>${parseFloat(item.saving_per_month || item.estimated_saving || '0').toFixed(2)}/mo</div>
                  </div>
                  <div className="text-xs text-white/40 mb-3 font-mono">{item.resource_id}</div>
                  
                  <div className="rounded-xl p-4 mb-4" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                    <div className="text-sm text-white/80 leading-relaxed">{item.recommendation}</div>
                  </div>

                  {confirming === item.resource_id ? (
                    <div className="rounded-xl p-4 mb-3 border" style={{background: 'rgba(248,113,113,0.05)', borderColor: 'rgba(248,113,113,0.2)'}}>
                      <div className="text-xs font-semibold text-red-400 mb-2 uppercase tracking-wider">⚠️ {getConfirmMessage(item).title}</div>
                      <div className="text-sm text-red-300/80 mb-4">{getConfirmMessage(item).msg}</div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleStop(item)}
                          className="text-xs font-bold px-4 py-2 rounded-lg text-white shadow-lg transition-all hover:scale-105"
                          style={{background: 'linear-gradient(135deg, #EF4444, #B91C1C)'}}
                        >
                          Yes, proceed
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          className="text-xs font-medium px-4 py-2 rounded-lg border transition-colors hover:bg-white/5"
                          style={{borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)'}}
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
                        style={{background: 'linear-gradient(135deg, #0F6E56, #094d3c)', boxShadow: '0 4px 15px rgba(15,110,86,0.3)'}}
                      >
                        Take action
                      </button>
                      <button
                        onClick={() => handleDismiss(item.resource_id)}
                        className="text-xs font-medium px-5 py-2.5 rounded-lg border transition-colors hover:bg-white/5"
                        style={{borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)'}}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}