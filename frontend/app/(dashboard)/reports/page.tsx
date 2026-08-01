'use client'
import { useState, useEffect } from 'react'
import { getReportContent } from '@/lib/api'
import { useReports } from '@/lib/queries'

export default function ReportsPage() {
  const reportsQuery = useReports()
  const reports: any[] = reportsQuery.data?.reports || []
  const loading = reportsQuery.isLoading

  const [selected, setSelected] = useState<any | null>(null)
  const [reportContent, setReportContent] = useState<string>('')
  const [contentLoading, setContentLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Auto-select the first report once the list loads, if none is selected yet
  useEffect(() => {
    if (selected || reports.length === 0) return
    handleSelectReport(reports[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports.length])

  const handleSelectReport = async (report: any) => {
    setSelected(report)
    setContentLoading(true)
    setReportContent('')
    try {
      // Fetch via API Lambda — no CORS issues
      const data = await getReportContent(report.key)
      setReportContent(data.content || 'No content available')
    } catch (err) {
      // Fallback to direct S3 fetch
      try {
        const res = await fetch(report.url)
        if (res.ok) {
          const text = await res.text()
          setReportContent(text)
        } else {
          setReportContent('Failed to load report. Click Download to view in a new tab.')
        }
      } catch {
        setReportContent('Failed to load report. Click Download to view in a new tab.')
      }
    } finally {
      setContentLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!reportContent || !selected) return
    setDownloading(true)

    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 20
      const contentWidth = pageWidth - margin * 2

      // Header background
      doc.setFillColor(15, 110, 86)
      doc.rect(0, 0, pageWidth, 35, 'F')

      // Logo area
      doc.setFillColor(255, 255, 255, 0.2)
      doc.roundedRect(margin, 8, 18, 18, 3, 3, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('CG', margin + 9, 19, { align: 'center' })

      // Title
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('Cloud Guardian', margin + 22, 16)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('AWS Infrastructure Intelligence Report', margin + 22, 23)

      // Date on right
      doc.setFontSize(9)
      doc.text(
        new Date(selected.date).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        }),
        pageWidth - margin, 19,
        { align: 'right' }
      )

      // Divider line
      doc.setDrawColor(255, 255, 255, 0.3)
      doc.line(margin, 29, pageWidth - margin, 29)

      // Generated label
      doc.setFontSize(7)
      doc.text('AI-GENERATED WEEKLY REPORT', margin, 33)

      // Content area
      let yPosition = 45
      doc.setTextColor(30, 30, 30)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')

      const lines = reportContent.split('\n')

      for (const line of lines) {
        if (yPosition > pageHeight - 25) {
          // Footer before new page
          doc.setFontSize(7)
          doc.setTextColor(150, 150, 150)
          doc.text(`Cloud Guardian — Confidential`, margin, pageHeight - 10)
          doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: 'right' })

          doc.addPage()
          yPosition = 20
          doc.setTextColor(30, 30, 30)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
        }

        const trimmed = line.trim()

        if (trimmed === '') {
          yPosition += 4
          continue
        }

        // Section headers (all caps or starts with ===)
        if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith('-') && !trimmed.startsWith('•')) {
          yPosition += 3
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(11)
          doc.setTextColor(15, 110, 86)
          doc.text(trimmed, margin, yPosition)
          yPosition += 2
          // Underline
          doc.setDrawColor(15, 110, 86)
          doc.setLineWidth(0.3)
          doc.line(margin, yPosition, margin + 80, yPosition)
          yPosition += 5
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          doc.setTextColor(30, 30, 30)
          continue
        }

        // Separator lines
        if (trimmed.startsWith('===') || trimmed.startsWith('───')) {
          yPosition += 2
          continue
        }

        // Numbered items
        if (/^\d+\./.test(trimmed)) {
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(15, 110, 86)
          const wrapped = doc.splitTextToSize(trimmed, contentWidth - 5)
          doc.text(wrapped, margin + 5, yPosition)
          yPosition += wrapped.length * 5 + 2
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(30, 30, 30)
          continue
        }

        // Bullet points
        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('✓') || trimmed.startsWith('+')) {
          doc.setTextColor(50, 50, 50)
          const wrapped = doc.splitTextToSize(trimmed, contentWidth - 8)
          doc.text(wrapped, margin + 4, yPosition)
          yPosition += wrapped.length * 5 + 1
          doc.setTextColor(30, 30, 30)
          continue
        }

        // Regular text
        const wrapped = doc.splitTextToSize(trimmed, contentWidth)
        doc.text(wrapped, margin, yPosition)
        yPosition += wrapped.length * 5 + 1
      }

      // Final footer
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text('Cloud Guardian — Confidential Infrastructure Report', margin, pageHeight - 10)
      doc.text(
        `Generated ${new Date().toLocaleString()} · Page ${doc.getNumberOfPages()}`,
        pageWidth - margin, pageHeight - 10,
        { align: 'right' }
      )

      // Save
      const filename = `cloud-guardian-report-${new Date(selected.date).toISOString().split('T')[0]}.pdf`
      doc.save(filename)

    } catch (err) {
      console.error('PDF generation failed:', err)
      // Fallback to opening URL
      window.open(selected.url, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#0F6E56', borderTopColor: 'transparent' }} />
          <div className="text-xs text-gray-400">Loading reports...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Weekly reports</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            AI-written · delivered to your email · {reports.length} report{reports.length !== 1 ? 's' : ''} available
          </p>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="auth-glass rounded-xl p-12 text-center" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm font-medium text-white mb-1">No reports yet</div>
          <div className="text-xs text-gray-400">
            Your first report will be generated at the next scheduled run.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5 flex-1 min-h-0">

          {/* Report list */}
          <div className="col-span-1 flex flex-col gap-2 overflow-y-auto pr-1">
            {reports.map((report, i) => (
              <div
                key={i}
                onClick={() => handleSelectReport(report)}
                className="auth-glass rounded-xl p-4 cursor-pointer transition-all hover:bg-white/5"
                style={{
                  border: selected?.key === report.key ? '1px solid #0F6E56' : '1px solid rgba(255,255,255,0.05)',
                  borderLeft: `3px solid ${selected?.key === report.key ? '#0F6E56' : 'rgba(255,255,255,0.1)'}`
                }}
              >
                {/* Health score badge */}
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-white">
                    {new Date(report.date).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })}
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(15, 110, 86, 0.2)', color: '#34D399' }}
                  >
                    AI Report
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(report.date).toLocaleDateString('en-US', { weekday: 'long' })} · {(report.size / 1024).toFixed(1)} KB
                </div>
                {selected?.key === report.key && (
                  <div className="text-xs mt-2 font-medium" style={{ color: '#0F6E56' }}>
                    Currently viewing →
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Report content */}
          <div className="col-span-2 flex flex-col" style={{ height: '100%' }}>
            {selected ? (
              <div className="auth-glass rounded-xl flex flex-col" style={{ height: '100%', border: '1px solid rgba(255,255,255,0.05)' }}>

                {/* Report header */}
                <div className="flex items-center justify-between p-5 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {new Date(selected.date).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      AI-generated infrastructure health summary
                    </div>
                  </div>
                  <button
                    onClick={handleDownloadPDF}
                    disabled={downloading || contentLoading || !reportContent}
                    className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg text-white font-medium transition-all disabled:opacity-50"
                    style={{ background: '#0F6E56', border: 'none', cursor: 'pointer' }}
                  >
                    {downloading ? (
                      <>
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                        Generating PDF...
                      </>
                    ) : (
                      <>
                        ↓ Download PDF
                      </>
                    )}
                  </button>
                </div>

                {/* Report body */}
                {contentLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: '#0F6E56', borderTopColor: 'transparent' }} />
                      <div className="text-xs text-gray-400">Loading report...</div>
                    </div>
                  </div>
                ) : reportContent ? (
                  <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {/* Render report with formatting */}
                    <div className="space-y-1 max-w-4xl pr-4 pb-8">
                      {reportContent.split('\n').map((line, i) => {
                        const trimmed = line.trim()

                        if (trimmed === '') return <div key={i} className="h-2" />

                        if (trimmed.startsWith('===') || trimmed.startsWith('───')) {
                          return <hr key={i} className="my-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                        }

                        if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith('-') && !trimmed.startsWith('•')) {
                          return (
                            <div key={i} className="pt-3 pb-1">
                              <div
                                className="text-xs font-bold tracking-wide uppercase"
                                style={{ color: '#34D399' }}
                              >
                                {trimmed}
                              </div>
                              <div className="h-px mt-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
                            </div>
                          )
                        }

                        if (/^\d+\./.test(trimmed)) {
                          return (
                            <div key={i} className="flex gap-2 py-0.5">
                              <span className="text-xs font-bold flex-shrink-0" style={{ color: '#34D399' }}>
                                {trimmed.match(/^\d+\./)?.[0]}
                              </span>
                              <span className="text-xs text-gray-300 leading-relaxed">
                                {trimmed.replace(/^\d+\.\s*/, '')}
                              </span>
                            </div>
                          )
                        }

                        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('✓')) {
                          return (
                            <div key={i} className="flex gap-2 py-0.5 pl-2">
                              <span className="text-xs flex-shrink-0" style={{ color: '#34D399' }}>
                                {trimmed.startsWith('✓') ? '✓' : '•'}
                              </span>
                              <span className="text-xs text-gray-400 leading-relaxed">
                                {trimmed.replace(/^[•\-✓]\s*/, '')}
                              </span>
                            </div>
                          )
                        }

                        return (
                          <p key={i} className="text-xs text-gray-300 leading-relaxed">
                            {trimmed}
                          </p>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-xs text-gray-400">No content available</div>
                  </div>
                )}

              </div>
            ) : (
              <div className="auth-glass rounded-xl p-12 text-center flex flex-col items-center justify-center" style={{ height: '100%', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-4xl mb-3">📋</div>
                <div className="text-sm font-medium text-white mb-1">Select a report to view</div>
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