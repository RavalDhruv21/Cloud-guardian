'use client'
import { useState, useEffect } from 'react'
import { getReports } from '@/lib/api'

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [reportContent, setReportContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const data = await getReports()
        setReports(data.reports || [])
      } catch (err) {
        console.error('Failed to fetch reports:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchReports()
  }, [])

  const handleSelectReport = async (report: any) => {
    setSelected(report)
    setContentLoading(true)
    try {
      const res = await fetch(report.url, {
        method: 'GET',
        mode: 'cors',
      })
      if (!res.ok) throw new Error('Failed to fetch')
      const text = await res.text()
      setReportContent(text)
    } catch (err) {
      setReportContent('Click Download to view this report in a new tab.')
    } finally {
      setContentLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 animate-entrance">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" style={{boxShadow: '0 0 15px rgba(16,185,129,0.2)'}}/>
          <div className="text-xs text-white/50">Loading reports...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-entrance w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-white">Weekly reports</h1>
          <p className="text-xs text-white/50 mt-0.5">
            AI-written every Sunday at 9am · delivered to your email
          </p>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="auth-glass rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4 opacity-80" style={{textShadow: '0 0 20px rgba(255,255,255,0.2)'}}>📋</div>
          <div className="text-sm font-semibold text-white mb-2">No reports yet</div>
          <div className="text-xs text-white/50 max-w-md mx-auto">
            Your first weekly report will be generated this Sunday at 9am and delivered to your email.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6 h-[calc(100vh-200px)]">

          {/* Report list */}
          <div className="col-span-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-2">
            {reports.map((report, i) => (
              <div
                key={i}
                onClick={() => handleSelectReport(report)}
                className="auth-glass rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02]"
                style={{
                  border: selected?.key === report.key
                    ? '1px solid #34D399'
                    : '1px solid rgba(255,255,255,0.05)',
                  background: selected?.key === report.key ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                  boxShadow: selected?.key === report.key ? '0 0 20px rgba(16,185,129,0.1)' : 'none'
                }}
              >
                <div className="text-sm font-semibold text-white mb-1">
                  {new Date(report.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
                <div className="text-xs text-white/40">
                  {(report.size / 1024).toFixed(1)} KB
                </div>
              </div>
            ))}
          </div>

          {/* Report content */}
          <div className="col-span-2 h-full">
            {selected ? (
              <div className="auth-glass rounded-2xl p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-6 flex-shrink-0">
                  <h2 className="text-base font-semibold text-white">
                    {new Date(selected.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.open(selected.url, '_blank')}
                      className="text-xs font-medium px-4 py-2 rounded-lg border transition-colors hover:bg-white/10"
                      style={{borderColor: 'rgba(255,255,255,0.1)', color: '#fff'}}
                    >
                      Download PDF
                    </button>
                  </div>
                </div>

                {contentLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <pre
                    className="flex-1 text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-mono rounded-xl p-5 overflow-y-auto custom-scrollbar"
                    style={{background: 'rgba(5,11,24,0.5)', border: '1px solid rgba(255,255,255,0.05)'}}
                  >
                    {reportContent}
                  </pre>
                )}
              </div>
            ) : (
              <div className="auth-glass rounded-2xl p-12 text-center flex flex-col items-center justify-center h-full">
                <div className="text-4xl mb-4 opacity-50" style={{textShadow: '0 0 20px rgba(255,255,255,0.1)'}}>📋</div>
                <div className="text-sm font-semibold text-white mb-2">
                  Select a report to view
                </div>
                <div className="text-xs text-white/40 max-w-sm">
                  Click any report on the left to read the full AI-written summary
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}