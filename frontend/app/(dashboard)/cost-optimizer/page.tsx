'use client'
import { useState, useEffect } from 'react'
import { getCostSuggestions, dismissSuggestion } from '@/lib/api'

export default function CostOptimizerPage() {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [stopped, setStopped] = useState<string[]>([])

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

  const handleStop = (resourceId: string) => {
    setStopped(prev => [...prev, resourceId])
    setSuggestions(prev => prev.filter(s => s.resource_id !== resourceId))
    setConfirming(null)
  }

  const active = suggestions.filter(s => !stopped.includes(s.resource_id))

  const totalSavings = active.reduce((sum, s) => {
    const amt = parseFloat(s.estimated_saving?.replace('$','').replace('/mo','') || '0')
    return sum + (isNaN(amt) ? 0 : amt)
  }, 0)

  const severityColor = (s: string) =>
    s === 'high' ? '#A32D2D' : s === 'medium' ? '#854F0B' : '#185FA5'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"/>
          <div className="text-xs text-gray-400">Scanning for cost savings...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Cost optimizer</h1>
          <p className="text-xs text-gray-400 mt-0.5">Weekly scan · finds idle and wasted resources</p>
        </div>
      </div>

      {/* Savings banner */}
      <div className="rounded-xl p-5 mb-6 border" style={{background: 'linear-gradient(135deg, #f0f9f4, #e8f5f0)', borderColor: '#a7f3d0'}}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium mb-1" style={{color: '#0F6E56'}}>Total potential savings</div>
            <div className="text-3xl font-bold" style={{color: '#0F6E56'}}>
              ${totalSavings.toFixed(2)}<span className="text-sm font-normal">/month</span>
            </div>
            <div className="text-xs mt-1" style={{color: '#0F6E56'}}>{active.length} resources identified</div>
          </div>
          <div className="text-5xl">💰</div>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-sm font-medium text-gray-700 mb-1">
            {suggestions.length === 0 ? 'No cost issues found' : 'All suggestions resolved'}
          </div>
          <div className="text-xs text-gray-400">
            {suggestions.length === 0
              ? 'Your AWS resources look well optimized. Next scan runs Sunday at 9am.'
              : 'Great work! Next scan runs Sunday at 9am.'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((item, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border shadow-sm p-5"
              style={{
                borderLeft: `3px solid ${severityColor(item.severity)}`,
                borderTop: '1px solid #f3f4f6',
                borderRight: '1px solid #f3f4f6',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{
                    background: item.resource_type === 'EC2' ? '#FCEBEB' : item.resource_type === 'RDS' ? '#FAEEDA' : '#E6F1FB',
                    color: item.resource_type === 'EC2' ? '#A32D2D' : item.resource_type === 'RDS' ? '#854F0B' : '#185FA5'
                  }}
                >
                  {item.resource_type || 'AWS'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium text-gray-900">{item.issue}</div>
                    <div className="text-lg font-bold" style={{color: '#0F6E56'}}>{item.estimated_saving}</div>
                  </div>
                  <div className="text-xs text-gray-400 mb-1">{item.resource_id}</div>
                  <div className="text-xs text-gray-600 mb-4 leading-relaxed">{item.recommendation}</div>

                  {confirming === item.resource_id ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                      <div className="text-xs font-medium text-red-700 mb-2">⚠️ Confirm action?</div>
                      <div className="text-xs text-red-600 mb-3">This will stop/remove the resource. Data is preserved.</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStop(item.resource_id)}
                          className="text-xs px-3 py-1.5 rounded-lg text-white"
                          style={{background: '#A32D2D'}}
                        >
                          Yes, proceed
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
                        onClick={() => setConfirming(item.resource_id)}
                        className="text-xs px-3 py-1.5 rounded-lg text-white"
                        style={{background: '#0F6E56'}}
                      >
                        Take action
                      </button>
                      <button
                        onClick={() => handleDismiss(item.resource_id)}
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
        </div>
      )}
    </div>
  )
}