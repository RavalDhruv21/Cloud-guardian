'use client'

import { useState, useEffect } from 'react'
import { User, Bell, Shield, Cloud, Save, Check, Eye, EyeOff, AlertCircle } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

interface UserProfile {
  name: string
  email: string
  avatar_initials: string
  company: string
  role: string
  timezone: string
  notification_email: string
  slack_webhook: string
  alert_email: boolean
  alert_slack: boolean
  aws_account_id: string
  aws_role_arn: string
  aws_region: string
}

const defaultProfile: UserProfile = {
  name: '',
  email: '',
  avatar_initials: '',
  company: '',
  role: '',
  timezone: 'Asia/Kolkata',
  notification_email: '',
  slack_webhook: '',
  alert_email: true,
  alert_slack: false,
  aws_account_id: '',
  aws_role_arn: '',
  aws_region: 'us-east-1',
}

const STORAGE_KEY = 'cg_user_profile'

// Save to localStorage so dashboard + topbar can read it
export const getUserProfile = (): UserProfile => {
  if (typeof window === 'undefined') return defaultProfile
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : defaultProfile
  } catch { return defaultProfile }
}

export const saveUserProfile = (profile: UserProfile) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  window.dispatchEvent(new Event('profile-updated'))
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'aws'>('profile')
  const [profile, setProfile] = useState<UserProfile>(defaultProfile)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    setLoading(true)

    // First load from localStorage instantly
    const local = getUserProfile()
    if (local.name) setProfile(local)

    // Then try to fetch from API
    try {
      const token = localStorage.getItem('cg_token') || ''
      const res = await fetch(`${API_URL}/user/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const merged = { ...defaultProfile, ...data.profile }
        setProfile(merged)
        saveUserProfile(merged) // sync to localStorage
      }
    } catch {
      // keep localStorage version
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleSave = async () => {
    if (!profile.name.trim()) return showToast('Name is required')
    setSaving(true)

    // Update initials
    const initials = profile.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    const updatedProfile = { ...profile, avatar_initials: initials }
    setProfile(updatedProfile)

    // Save to localStorage immediately (so topbar & dashboard update)
    saveUserProfile(updatedProfile)

    // Try to save to API
    try {
      const token = localStorage.getItem('cg_token') || ''
      await fetch(`${API_URL}/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updatedProfile),
      })
    } catch {}

    setSaving(false)
    setSaved(true)
    showToast('Settings saved!')
    setTimeout(() => setSaved(false), 3000)
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User size={15} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
    { id: 'security', label: 'Security', icon: <Shield size={15} /> },
    { id: 'aws', label: 'AWS Config', icon: <Cloud size={15} /> },
  ]

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1px solid #d1d5db',
    borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
    background: '#fff', color: '#111'
  }
  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block' as const, marginBottom: 6 }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 820, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 999,
          background: '#0F6E56', color: '#fff', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
        }}>{toast}</div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>Manage your profile, notifications, and AWS configuration.</p>
      </div>

      {/* Profile Preview Card */}
      <div style={{
        background: 'linear-gradient(135deg, #0F6E56 0%, #185FA5 100%)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 28, color: '#fff',
        display: 'flex', alignItems: 'center', gap: 20
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800, flexShrink: 0
        }}>
          {profile.avatar_initials || (profile.name ? profile.name[0].toUpperCase() : '?')}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{profile.name || 'Your Name'}</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>{profile.email || 'your@email.com'}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>{profile.company || 'Company'} · {profile.role || 'Role'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Sidebar Tabs */}
        <div style={{ width: 180, flexShrink: 0 }}>
          {tabs.map(tab => (
            <div key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                marginBottom: 4, fontSize: 13, fontWeight: 500,
                background: activeTab === tab.id ? '#f0fdf4' : 'transparent',
                color: activeTab === tab.id ? '#0F6E56' : '#6b7280',
                border: activeTab === tab.id ? '1px solid #bbf7d0' : '1px solid transparent',
                transition: 'all 0.15s'
              }}>
              {tab.icon} {tab.label}
            </div>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 24 }}>

          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#111' }}>Personal Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input style={inputStyle} value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="Ravi Sharma" />
                </div>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <input style={inputStyle} type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} placeholder="ravi@example.com" />
                </div>
                <div>
                  <label style={labelStyle}>Company / Organization</label>
                  <input style={inputStyle} value={profile.company} onChange={e => setProfile(p => ({ ...p, company: e.target.value }))} placeholder="Acme Corp" />
                </div>
                <div>
                  <label style={labelStyle}>Role / Job Title</label>
                  <input style={inputStyle} value={profile.role} onChange={e => setProfile(p => ({ ...p, role: e.target.value }))} placeholder="Cloud Engineer" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Timezone</label>
                  <select style={inputStyle} value={profile.timezone} onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))}>
                    <option value="Asia/Kolkata">India (IST) — UTC+5:30</option>
                    <option value="America/New_York">US Eastern — UTC-5</option>
                    <option value="America/Los_Angeles">US Pacific — UTC-8</option>
                    <option value="Europe/London">London (GMT)</option>
                    <option value="Asia/Singapore">Singapore — UTC+8</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#111' }}>Notification Channels</h3>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Notification Email</label>
                <input style={inputStyle} type="email" value={profile.notification_email} onChange={e => setProfile(p => ({ ...p, notification_email: e.target.value }))} placeholder="alerts@example.com" />
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Anomaly alerts and weekly reports will be sent here.</div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Slack Webhook URL</label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...inputStyle, paddingRight: 36 }}
                    type={showWebhook ? 'text' : 'password'}
                    value={profile.slack_webhook}
                    onChange={e => setProfile(p => ({ ...p, slack_webhook: e.target.value }))}
                    placeholder="https://hooks.slack.com/services/..."
                  />
                  <div onClick={() => setShowWebhook(!showWebhook)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#9ca3af' }}>
                    {showWebhook ? <EyeOff size={14} /> : <Eye size={14} />}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Alert Channels</div>
                {[
                  { key: 'alert_email', label: 'Email alerts', desc: 'Receive anomaly and security alerts by email' },
                  { key: 'alert_slack', label: 'Slack alerts', desc: 'Receive alerts in your Slack workspace' },
                ].map(item => (
                  <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{item.desc}</div>
                    </div>
                    <div
                      onClick={() => setProfile(p => ({ ...p, [item.key]: !p[item.key as keyof UserProfile] }))}
                      style={{
                        width: 40, height: 23, borderRadius: 12, cursor: 'pointer',
                        background: profile[item.key as keyof UserProfile] ? '#0F6E56' : '#d1d5db',
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0
                      }}>
                      <div style={{
                        position: 'absolute', top: 3,
                        left: profile[item.key as keyof UserProfile] ? 19 : 3,
                        width: 17, height: 17, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#111' }}>Security Settings</h3>

              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10 }}>
                <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: '#92400e' }}>
                  Password changes are handled via <strong>AWS Cognito</strong>. Use the Cognito user pool console or the forgot password flow on the login page.
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Active Session</div>
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#6b7280' }}>
                  <div>Logged in via AWS Cognito</div>
                  <div style={{ marginTop: 4 }}>Region: {profile.aws_region || 'us-east-1'}</div>
                  <div style={{ marginTop: 4 }}>Account: {profile.aws_account_id || '—'}</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Data & Privacy</div>
                {[
                  { label: 'Anonymize metrics in reports', desc: 'Replace instance IDs with generic labels in AI reports' },
                  { label: 'Share usage analytics', desc: 'Help improve Cloud Guardian (anonymous data only)' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{item.desc}</div>
                    </div>
                    <div style={{ width: 40, height: 23, borderRadius: 12, background: '#d1d5db', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 3, left: 3, width: 17, height: 17, borderRadius: '50%', background: '#fff' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AWS CONFIG TAB */}
          {activeTab === 'aws' && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#111' }}>AWS Configuration</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>AWS Account ID</label>
                  <input style={inputStyle} value={profile.aws_account_id} onChange={e => setProfile(p => ({ ...p, aws_account_id: e.target.value }))} placeholder="123456789012" />
                </div>
                <div>
                  <label style={labelStyle}>Cross-Account IAM Role ARN</label>
                  <input style={inputStyle} value={profile.aws_role_arn} onChange={e => setProfile(p => ({ ...p, aws_role_arn: e.target.value }))} placeholder="arn:aws:iam::123456789012:role/CloudGuardianRole" />
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>This role allows Cloud Guardian to read metrics from your account.</div>
                </div>
                <div>
                  <label style={labelStyle}>Default AWS Region</label>
                  <select style={inputStyle} value={profile.aws_region} onChange={e => setProfile(p => ({ ...p, aws_region: e.target.value }))}>
                    {['us-east-1','us-east-2','us-west-1','us-west-2','ap-south-1','ap-southeast-1','ap-northeast-1','eu-west-1','eu-central-1'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #f3f4f6' }}>
            <button onClick={handleSave} disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: saved ? '#16a34a' : '#0F6E56', color: '#fff',
                border: 'none', padding: '10px 22px', borderRadius: 10,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s'
              }}>
              {saved ? <><Check size={15} /> Saved!</> : saving ? 'Saving...' : <><Save size={15} /> Save Changes</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}