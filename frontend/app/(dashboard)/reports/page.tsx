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
    // Fallback — open in new tab instead
    setReportContent('Click Download to view this report in a new tab.')
  } finally {
    setContentLoading(false)
  }
}

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{borderColor: '#0F6E56', borderTopColor: 'transparent'}}
          />
          <div className="text-xs text-gray-400">Loading reports...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Weekly reports</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            AI-written every Sunday at 9am · delivered to your email
          </p>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm font-medium text-gray-700 mb-1">No reports yet</div>
          <div className="text-xs text-gray-400">
            Your first weekly report will be generated this Sunday at 9am and delivered to your email.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">

          {/* Report list */}
          <div className="col-span-1 flex flex-col gap-3">
            {reports.map((report, i) => (
              <div
                key={i}
                onClick={() => handleSelectReport(report)}
                className="bg-white rounded-xl shadow-sm p-4 cursor-pointer transition-all"
                style={{
                  border: selected?.key === report.key
                    ? '2px solid #0F6E56'
                    : '1px solid #f3f4f6',
                }}
              >
                <div className="text-xs font-medium text-gray-700 mb-1">
                  {new Date(report.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
                <div className="text-xs text-gray-400">
                  {(report.size / 1024).toFixed(1)} KB
                </div>
              </div>
            ))}
          </div>

          {/* Report content */}
          <div className="col-span-2">
            {selected ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900">
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
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      Download
                    </button>
                  </div>
                </div>

                {contentLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div
                      className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                      style={{borderColor: '#0F6E56', borderTopColor: 'transparent'}}
                    />
                  </div>
                ) : (
                  <pre
                    className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-4 overflow-y-auto"
                    style={{maxHeight: '500px'}}
                  >
                    {reportContent}
                  </pre>
                )}
              </div>
            ) : (
              <div
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center flex flex-col items-center justify-center"
                style={{height: '100%'}}
              >
                <div className="text-4xl mb-3">📋</div>
                <div className="text-sm font-medium text-gray-700 mb-1">
                  Select a report to view
                </div>
                <div className="text-xs text-gray-400">
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