'use client'
import { useState } from 'react'

export default function SettingsPage() {
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [slackWebhook, setSlackWebhook] = useState('')
  const [autoRevertPort22, setAutoRevertPort22] = useState(true)
  const [autoRevertS3, setAutoRevertS3] = useState(true)
  const [alertThreshold, setAlertThreshold] = useState('medium')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const Toggle = ({ value, onChange }: { value: boolean, onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className="w-10 h-5 rounded-full transition-all relative"
      style={{background: value ? '#0F6E56' : '#e5e7eb'}}
    >
      <div
        className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm"
        style={{left: value ? '22px' : '2px'}}
      />
    </button>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage your account and preferences</p>
        </div>
        <button
          onClick={handleSave}
          className="text-xs px-4 py-2 rounded-lg text-white transition-all"
          style={{background: saved ? '#185FA5' : '#0F6E56'}}
        >
          {saved ? 'Saved ✓' : 'Save changes'}
        </button>
      </div>

      <div className="flex flex-col gap-4">

        {/* Profile */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Profile</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Full name</label>
              <input defaultValue="Rishi Kumar" className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
              <input defaultValue="rishi@example.com" className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"/>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Alert preferences</h2>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-gray-700">Email alerts</div>
                <div className="text-xs text-gray-400">Receive anomaly alerts via email</div>
              </div>
              <Toggle value={emailAlerts} onChange={setEmailAlerts}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Slack webhook URL</label>
              <input
                value={slackWebhook}
                onChange={e => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Alert threshold</label>
              <select
                value={alertThreshold}
                onChange={e => setAlertThreshold(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
              >
                <option value="low">All severities (low and above)</option>
                <option value="medium">Medium and above</option>
                <option value="high">High and critical only</option>
                <option value="critical">Critical only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Auto-remediation */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Auto-remediation rules</h2>
          <p className="text-xs text-gray-400 mb-4">Choose what gets auto-fixed vs just alerted</p>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-gray-700">Auto-revert open port 22</div>
                <div className="text-xs text-gray-400">Instantly revert if port 22 opens to 0.0.0.0/0</div>
              </div>
              <Toggle value={autoRevertPort22} onChange={setAutoRevertPort22}/>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-gray-700">Auto-revert public S3 bucket</div>
                <div className="text-xs text-gray-400">Instantly revert if bucket ACL is made public</div>
              </div>
              <Toggle value={autoRevertS3} onChange={setAutoRevertS3}/>
            </div>
          </div>
        </div>

        {/* Plan */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Current plan</h2>
          <div className="flex items-center justify-between mt-3">
            <div>
              <div className="text-sm font-bold" style={{color: '#0F6E56'}}>Pro — Beta</div>
              <div className="text-xs text-gray-400 mt-0.5">All Pro features free during beta period</div>
            </div>
            <span className="text-xs font-medium px-3 py-1 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
              Active ✓
            </span>
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-xl border shadow-sm p-5" style={{borderColor: '#fee2e2'}}>
          <h2 className="text-sm font-semibold mb-1" style={{color: '#A32D2D'}}>Danger zone</h2>
          <p className="text-xs text-gray-400 mb-3">Irreversible actions — proceed with caution</p>
          <button className="text-xs px-3 py-2 rounded-lg border text-red-600 hover:bg-red-50 transition-colors" style={{borderColor: '#fca5a5'}}>
            Delete account
          </button>
        </div>

      </div>
    </div>
  )
}