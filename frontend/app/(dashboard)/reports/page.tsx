'use client'
import { useState } from 'react'

const reports = [
  {
    id: 1,
    date: '2025-06-01',
    label: 'Week of June 1, 2025',
    health_score: 7,
    anomalies: 7,
    savings_identified: '$43',
    critical_issues: 2,
    content: `CLOUD GUARDIAN WEEKLY INFRASTRUCTURE REPORT
Week of June 1, 2025
════════════════════════════════════

EXECUTIVE SUMMARY
─────────────────
Your AWS infrastructure scored 7/10 this week. Two critical issues required attention — a suspected cryptominer on i-0abc123456 and an unexpected NAT Gateway bill spike. Both security misconfigurations were auto-reverted within seconds. Cost optimization opportunities of $43/month were identified.

CRITICAL ISSUES
───────────────
1. EC2 i-0abc123456 — CPU at 94% for 3+ hours with zero inbound traffic
   Status: Unresolved — immediate action recommended
   Action: SSH in, run htop, kill suspicious processes

2. Daily bill spike — $47 today vs $5 average
   Cause: NAT Gateway processed unusual data volume
   Action: Review NAT Gateway traffic patterns

SECURITY EVENTS (Auto-remediated)
──────────────────────────────────
✓ Port 22 opened to 0.0.0.0/0 → auto-reverted in 4 seconds
✓ S3 bucket made public → auto-reverted in 7 seconds

COST SAVINGS OPPORTUNITIES
──────────────────────────
- EC2 i-0def789012 idle 9 days → $28/month savings
- RDS db-backup-01 zero connections → $11/month savings
- 2 unattached EBS volumes → $4/month savings
- 1 unused Elastic IP → $3.60/month savings
Total potential savings: $46.60/month

INFRASTRUCTURE HEALTH SCORE: 7/10
───────────────────────────────────
+Points: Good uptime, security auto-remediation working
-Points: Unresolved cryptominer, bill spike, idle resources

TOP 3 RECOMMENDED ACTIONS FOR NEXT WEEK
────────────────────────────────────────
1. Investigate i-0abc123456 — SSH in and check for malicious processes
2. Stop idle EC2 i-0def789012 — save $28/month immediately
3. Review NAT Gateway usage — identify what caused the traffic spike`
  },
  {
    id: 2,
    date: '2025-05-25',
    label: 'Week of May 25, 2025',
    health_score: 9,
    anomalies: 2,
    savings_identified: '$12',
    critical_issues: 0,
    content: `CLOUD GUARDIAN WEEKLY INFRASTRUCTURE REPORT
Week of May 25, 2025
════════════════════════════════════

EXECUTIVE SUMMARY
─────────────────
Excellent week — your infrastructure scored 9/10. No critical issues detected. Minor cost savings identified. All systems running within normal parameters.

INFRASTRUCTURE HEALTH SCORE: 9/10

COST SAVINGS OPPORTUNITIES
──────────────────────────
- 1 unused Elastic IP → $3.60/month savings
- 1 unattached EBS volume → $8/month savings
Total potential savings: $11.60/month

TOP 3 RECOMMENDED ACTIONS FOR NEXT WEEK
────────────────────────────────────────
1. Release unused Elastic IP — quick win
2. Review and delete unattached EBS volume
3. Continue monitoring — infrastructure looks healthy`
  },
]

export default function ReportsPage() {
  const [selected, setSelected] = useState<number | null>(null)

  const selectedReport = reports.find(r => r.id === selected)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Weekly reports</h1>
          <p className="text-xs text-gray-400 mt-0.5">AI-written every Sunday at 9am · delivered to your email</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* Report list */}
        <div className="col-span-1 flex flex-col gap-3">
          {reports.map(report => (
            <div
              key={report.id}
              onClick={() => setSelected(report.id)}
              className="bg-white rounded-xl border shadow-sm p-4 cursor-pointer transition-all hover:border-emerald-300"
              style={{
                borderColor: selected === report.id ? '#0F6E56' : '#f3f4f6',
                borderWidth: selected === report.id ? 2 : 1
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-700">{report.label}</span>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: report.health_score >= 8 ? '#E1F5EE' : report.health_score >= 6 ? '#FAEEDA' : '#FCEBEB',
                    color: report.health_score >= 8 ? '#0F6E56' : report.health_score >= 6 ? '#854F0B' : '#A32D2D'
                  }}
                >
                  {report.health_score}/10
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-800">{report.anomalies}</div>
                  <div className="text-xs text-gray-400">anomalies</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold" style={{color: '#0F6E56'}}>{report.savings_identified}</div>
                  <div className="text-xs text-gray-400">savings</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold" style={{color: report.critical_issues > 0 ? '#A32D2D' : '#0F6E56'}}>
                    {report.critical_issues}
                  </div>
                  <div className="text-xs text-gray-400">critical</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Report content */}
        <div className="col-span-2">
          {selectedReport ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">{selectedReport.label}</h2>
                <div className="flex gap-2">
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                    Download PDF
                  </button>
                  <button className="text-xs px-3 py-1.5 rounded-lg text-white" style={{background: '#0F6E56'}}>
                    Email report
                  </button>
                </div>
              </div>
              <pre className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-4 overflow-y-auto" style={{maxHeight: '500px'}}>
                {selectedReport.content}
              </pre>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center h-full flex flex-col items-center justify-center">
              <div className="text-4xl mb-3">📋</div>
              <div className="text-sm font-medium text-gray-700 mb-1">Select a report to view</div>
              <div className="text-xs text-gray-400">Click any report on the left to read the full AI-written summary</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}