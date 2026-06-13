'use client'
import { useState, useEffect } from 'react'

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

const Toggle = ({ value, onChange }: { value: boolean, onChange: () => void }) => (
  <button
    onClick={onChange}
    style={{
      width: 40, height: 22, borderRadius: 11, border: 'none',
      background: value ? '#34D399' : 'rgba(255,255,255,0.1)',
      position: 'relative', cursor: 'pointer',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', flexShrink: 0,
      boxShadow: value ? '0 0 10px rgba(52,211,153,0.3)' : 'none'
    }}
  >
    <div style={{
      position: 'absolute', top: 3,
      left: value ? 21 : 3,
      width: 16, height: 16, borderRadius: '50%',
      background: value ? '#050B18' : '#fff', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    }}/>
  </button>
)

const Input = ({ label, value, onChange, placeholder, type = 'text', hint }: any) => (
  <div>
    <label style={{fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8}}>
      {label}
    </label>
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px', fontSize: 13, outline: 'none',
        background: 'rgba(255,255,255,0.02)', color: '#fff', boxSizing: 'border-box',
        transition: 'border-color 0.2s'
      }}
      onFocus={e => e.target.style.borderColor = '#0F6E56'}
      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
    />
    {hint && <div style={{fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6}}>{hint}</div>}
  </div>
)

const Select = ({ label, value, onChange, options }: any) => (
  <div>
    <label style={{fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8}}>
      {label}
    </label>
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px', fontSize: 13, outline: 'none',
        background: 'rgba(255,255,255,0.02)', color: '#fff', boxSizing: 'border-box' as const,
        appearance: 'none', transition: 'border-color 0.2s'
      }}
      onFocus={e => e.target.style.borderColor = '#0F6E56'}
      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
    >
      {options.map((o: any) => (
        <option key={o.value} value={o.value} style={{background: '#050B18', color: '#fff'}}>{o.label || o.value}</option>
      ))}
    </select>
  </div>
)

const SectionTitle = ({ children }: { children: string }) => (
  <div style={{
    fontSize: 14, fontWeight: 600, color: '#fff',
    marginBottom: 20, paddingBottom: 12,
    borderBottom: '1px solid rgba(255,255,255,0.05)'
  }}>
    {children}
  </div>
)

const ToggleRow = ({ label, desc, value, onChange }: any) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '14px 0',
    borderBottom: '1px solid rgba(255,255,255,0.02)'
  }}>
    <div>
      <div style={{fontSize: 13, fontWeight: 600, color: '#fff'}}>{label}</div>
      <div style={{fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4}}>{desc}</div>
    </div>
    <Toggle value={value} onChange={onChange}/>
  </div>
)

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'aws'>('profile')
  const [profile, setProfile] = useState<UserProfile>(defaultProfile)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [currentRegion, setCurrentRegion] = useState('us-east-1')

  useEffect(() => {
    const local = getUserProfile()
    if (local.name) setProfile(local)
    if (typeof window !== 'undefined') {
      setCurrentRegion(localStorage.getItem('selected_region') || 'us-east-1')
    }
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleSave = async () => {
    if (!profile.name.trim()) return showToast('Name is required')
    setSaving(true)
    const initials = profile.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    const updated = { ...profile, avatar_initials: initials }
    setProfile(updated)
    saveUserProfile(updated)
    setSaving(false)
    setSaved(true)
    showToast('Settings saved!')
    setTimeout(() => setSaved(false), 3000)
  }

  const handleDisconnect = () => {
    const updated = { ...profile, aws_account_id: '', aws_role_arn: '' }
    setProfile(updated)
    saveUserProfile(updated)
    showToast('Account disconnected')
  }

  const isConnected = !!(profile.aws_account_id || profile.aws_role_arn)

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'security', label: 'Security', icon: '🛡️' },
    { id: 'aws', label: 'AWS Config', icon: '☁️' },
  ]

  return (
    <div className="animate-entrance w-full">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 30, right: 30, zIndex: 999,
          background: 'rgba(16,185,129,0.95)', color: '#fff', padding: '12px 24px',
          borderRadius: '12px', fontSize: 13, fontWeight: 600,
          boxShadow: '0 10px 30px rgba(16,185,129,0.3)', backdropFilter: 'blur(10px)',
          animation: 'entrance 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {toast}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-white">Settings</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Manage your profile, notifications and AWS configuration
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs px-6 py-2.5 rounded-lg text-white font-bold transition-all disabled:opacity-50 hover:scale-105"
          style={{
            background: saved ? 'rgba(52,211,153,0.2)' : 'linear-gradient(135deg, #0F6E56, #094d3c)',
            color: saved ? '#34D399' : '#fff',
            border: saved ? '1px solid rgba(52,211,153,0.3)' : 'none',
            boxShadow: saved ? '0 0 15px rgba(52,211,153,0.1)' : '0 4px 15px rgba(15,110,86,0.3)',
            cursor: 'pointer'
          }}
        >
          {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      {/* Profile preview card */}
      <div
        className="rounded-2xl p-6 mb-8 flex items-center gap-5 shadow-lg border transition-all"
        style={{
          background: 'linear-gradient(135deg, rgba(15,110,86,0.2) 0%, rgba(24,95,165,0.2) 100%)',
          borderColor: 'rgba(15,110,86,0.3)',
        }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
          style={{background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)'}}
        >
          {profile.avatar_initials || (profile.name ? profile.name[0].toUpperCase() : '?')}
        </div>
        <div>
          <div className="text-lg font-semibold text-white">
            {profile.name || 'Your Name'}
          </div>
          <div className="text-sm mt-1 font-mono" style={{color: 'rgba(255,255,255,0.6)'}}>
            {profile.email || 'your@email.com'}
          </div>
          <div className="text-xs mt-1.5 font-medium uppercase tracking-wider" style={{color: 'rgba(255,255,255,0.4)'}}>
            {[profile.company, profile.role, profile.timezone].filter(Boolean).join(' • ') || 'Complete your profile'}
          </div>
        </div>
      </div>

      <div className="flex gap-6">

        {/* Tab sidebar */}
        <div className="flex-shrink-0 w-48">
          <div className="flex flex-col gap-1.5 p-2 rounded-2xl auth-glass">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                  color: activeTab === tab.id ? '#34D399' : 'rgba(255,255,255,0.6)',
                  border: '1px solid transparent',
                  cursor: 'pointer', textAlign: 'left',
                  textShadow: activeTab === tab.id ? '0 0 10px rgba(52,211,153,0.3)' : 'none'
                }}
              >
                <span className={activeTab === tab.id ? 'opacity-100' : 'opacity-50'}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 auth-glass rounded-2xl p-8">

            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="animate-entrance">
                <SectionTitle>Personal information</SectionTitle>
                <div className="grid grid-cols-2 gap-6 mt-6">
                  <Input
                    label="Full name *"
                    value={profile.name}
                    onChange={(v: string) => setProfile(p => ({...p, name: v}))}
                    placeholder="Ravi Sharma"
                  />
                  <Input
                    label="Email address"
                    type="email"
                    value={profile.email}
                    onChange={(v: string) => setProfile(p => ({...p, email: v}))}
                    placeholder="ravi@example.com"
                  />
                  <Input
                    label="Company / Organization"
                    value={profile.company}
                    onChange={(v: string) => setProfile(p => ({...p, company: v}))}
                    placeholder="Acme Corp"
                  />
                  <Input
                    label="Role / Job title"
                    value={profile.role}
                    onChange={(v: string) => setProfile(p => ({...p, role: v}))}
                    placeholder="Cloud Engineer"
                  />
                  <div className="col-span-2">
                    <Select
                      label="Timezone"
                      value={profile.timezone}
                      onChange={(v: string) => setProfile(p => ({...p, timezone: v}))}
                      options={[
                        {value: 'Asia/Kolkata', label: 'India (IST) — UTC+5:30'},
                        {value: 'America/New_York', label: 'US Eastern — UTC-5'},
                        {value: 'America/Los_Angeles', label: 'US Pacific — UTC-8'},
                        {value: 'Europe/London', label: 'London (GMT)'},
                        {value: 'Asia/Singapore', label: 'Singapore — UTC+8'},
                        {value: 'UTC', label: 'UTC'},
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* NOTIFICATIONS TAB */}
            {activeTab === 'notifications' && (
              <div className="animate-entrance">
                <SectionTitle>Notification channels</SectionTitle>
                <div className="flex flex-col gap-6 mt-6 mb-8">
                  <Input
                    label="Notification email"
                    type="email"
                    value={profile.notification_email}
                    onChange={(v: string) => setProfile(p => ({...p, notification_email: v}))}
                    placeholder="alerts@example.com"
                    hint="Anomaly alerts and weekly reports will be sent here"
                  />
                  <div>
                    <label style={{fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8}}>
                      Slack webhook URL
                    </label>
                    <div style={{position: 'relative'}}>
                      <input
                        type={showWebhook ? 'text' : 'password'}
                        value={profile.slack_webhook}
                        onChange={e => setProfile(p => ({...p, slack_webhook: e.target.value}))}
                        placeholder="https://hooks.slack.com/services/..."
                        style={{
                          width: '100%', padding: '10px 40px 10px 14px',
                          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                          fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
                          background: 'rgba(255,255,255,0.02)', color: '#fff',
                          transition: 'border-color 0.2s'
                        }}
                        onFocus={e => e.target.style.borderColor = '#0F6E56'}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                      />
                      <button
                        onClick={() => setShowWebhook(!showWebhook)}
                        style={{
                          position: 'absolute', right: 12,
                          top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none',
                          cursor: 'pointer', fontSize: 14, opacity: 0.6
                        }}
                      >
                        {showWebhook ? '🙈' : '👁'}
                      </button>
                    </div>
                  </div>
                </div>

                <SectionTitle>Alert preferences</SectionTitle>
                <div className="mt-4">
                  <ToggleRow
                    label="Email alerts"
                    desc="Receive anomaly and security alerts by email"
                    value={profile.alert_email}
                    onChange={() => setProfile(p => ({...p, alert_email: !p.alert_email}))}
                  />
                  <ToggleRow
                    label="Slack alerts"
                    desc="Receive alerts in your Slack workspace"
                    value={profile.alert_slack}
                    onChange={() => setProfile(p => ({...p, alert_slack: !p.alert_slack}))}
                  />
                </div>
              </div>
            )}

            {/* SECURITY TAB */}
            {activeTab === 'security' && (
              <div className="animate-entrance">
                <SectionTitle>Security settings</SectionTitle>

                <div
                  className="rounded-xl p-5 mt-6 mb-6 text-sm leading-relaxed"
                  style={{background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)', color: '#FBBF24'}}
                >
                  ⚠️ Password changes are handled via <strong>AWS Cognito</strong>. Use the Cognito user pool console or the forgot password flow on the login page.
                </div>

                <div className="rounded-xl p-5 mb-8" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">Active session</div>
                  <div className="grid grid-cols-2 gap-5">
                    {[
                      {label: 'Auth provider', value: 'AWS Cognito'},
                      {label: 'Region', value: profile.aws_region || 'us-east-1'},
                      {label: 'Account ID', value: profile.aws_account_id || '—'},
                      {label: 'Plan', value: 'Pro · Beta'},
                    ].map(item => (
                      <div key={item.label}>
                        <div className="text-xs text-white/40 mb-1">{item.label}</div>
                        <div className="text-sm font-semibold text-white/90">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <SectionTitle>Data & privacy</SectionTitle>
                <div className="mt-4">
                  <ToggleRow
                    label="Anonymize metrics in reports"
                    desc="Replace instance IDs with generic labels in AI reports"
                    value={false}
                    onChange={() => {}}
                  />
                  <ToggleRow
                    label="Share usage analytics"
                    desc="Help improve Cloud Guardian (anonymous data only)"
                    value={false}
                    onChange={() => {}}
                  />
                </div>

                <div className="mt-8 pt-6 border-t" style={{borderColor: 'rgba(255,255,255,0.05)'}}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-4">Danger zone</div>
                  <button
                    className="text-xs font-medium px-4 py-2.5 rounded-lg border transition-colors hover:bg-red-500/10"
                    style={{borderColor: 'rgba(248,113,113,0.3)', color: '#F87171', background: 'transparent', cursor: 'pointer'}}
                  >
                    Delete account
                  </button>
                </div>
              </div>
            )}

            {/* AWS CONFIG TAB */}
            {activeTab === 'aws' && (
              <div className="animate-entrance">
                <SectionTitle>AWS configuration</SectionTitle>

                {!isConnected ? (
                  /* Not connected state */
                  <div className="text-center py-16">
                    <div className="text-6xl mb-6 opacity-80" style={{textShadow: '0 0 30px rgba(255,255,255,0.2)'}}>☁️</div>
                    <div className="text-lg font-semibold text-white mb-2">
                      No AWS account connected
                    </div>
                    <div className="text-sm text-white/50 mb-8 leading-relaxed max-w-sm mx-auto">
                      Connect your AWS account to start monitoring your infrastructure, detecting anomalies, and optimizing costs.
                    </div>
                    <button
                      onClick={() => { window.location.href = '/connect-aws' }}
                      className="text-sm px-6 py-3 rounded-xl text-white font-bold transition-all hover:scale-105"
                      style={{background: 'linear-gradient(135deg, #0F6E56, #094d3c)', boxShadow: '0 4px 15px rgba(15,110,86,0.3)', border: 'none', cursor: 'pointer'}}
                    >
                      🔌 Connect AWS account
                    </button>
                    <div className="mt-5 text-xs text-white/30 font-medium">
                      Takes 2 minutes · Read-only access · Free
                    </div>
                  </div>
                ) : (
                  /* Connected state */
                  <div className="flex flex-col gap-6 mt-6">

                    {/* Status banner */}
                    <div
                      className="rounded-xl p-5 flex items-center justify-between shadow-lg"
                      style={{background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)'}}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                          style={{background: '#0F6E56'}}
                        >
                          ✓
                        </div>
                        <div>
                          <div className="text-sm font-bold tracking-wide" style={{color: '#34D399'}}>
                            AWS account connected
                          </div>
                          <div className="text-xs text-emerald-100/50 mt-1">
                            Monitoring active · metrics collected every 15 minutes
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => { window.location.href = '/connect-aws' }}
                        className="text-xs font-medium px-4 py-2.5 rounded-lg border transition-colors hover:bg-white/5"
                        style={{borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', background: 'transparent', cursor: 'pointer'}}
                      >
                        Add another
                      </button>
                    </div>

                    {/* Account details */}
                    <div className="rounded-xl p-5" style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                      <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">Account details</div>
                      <div className="grid grid-cols-2 gap-5">
                        {[
                          {
                            label: 'Account ID',
                            value: profile.aws_account_id || process.env.NEXT_PUBLIC_AWS_ACCOUNT_ID || '—'
                          },
                          {
                            label: 'Region',
                            value: currentRegion
                          },
                          {label: 'Monitoring status', value: 'Active'},
                          {label: 'Collection interval', value: 'Every 15 minutes'},
                        ].map(item => (
                          <div key={item.label}>
                            <div className="text-xs text-white/40 mb-1">{item.label}</div>
                            <div className="text-sm font-semibold text-white/90">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Role ARN */}
                    {profile.aws_role_arn && (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">IAM Role ARN</div>
                        <div
                          className="text-xs font-mono p-4 rounded-xl break-all"
                          style={{background: 'rgba(5,11,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)'}}
                        >
                          {profile.aws_role_arn}
                        </div>
                        <div className="text-xs text-white/30 mt-2 font-medium">
                          Read-only access · revoke anytime by deleting this role from your AWS console
                        </div>
                      </div>
                    )}

                    {/* Region selector */}
                    <div className="mt-2">
                      <Select
                        label="Default monitoring region"
                        value={profile.aws_region || currentRegion}
                        onChange={(v: string) => {
                          setProfile(p => ({...p, aws_region: v}))
                          setCurrentRegion(v)
                          if (typeof window !== 'undefined') {
                            localStorage.setItem('selected_region', v)
                            window.dispatchEvent(new Event('region-changed'))
                          }
                        }}
                        options={[
                          'us-east-1','us-east-2','us-west-1','us-west-2',
                          'ap-south-1','ap-southeast-1','ap-northeast-1',
                          'eu-west-1','eu-central-1'
                        ].map(r => ({value: r, label: r}))}
                      />
                    </div>

                    {/* Disconnect */}
                    <div className="pt-6 mt-2 border-t" style={{borderColor: 'rgba(255,255,255,0.05)'}}>
                      <div className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-2">
                        Disconnect account
                      </div>
                      <div className="text-xs text-red-200/50 mb-4 max-w-md leading-relaxed">
                        This removes the connection from Cloud Guardian. Your IAM role in AWS will remain — delete it manually from your AWS Console to fully revoke access.
                      </div>
                      <button
                        onClick={handleDisconnect}
                        className="text-xs font-medium px-4 py-2.5 rounded-lg border transition-colors hover:bg-red-500/10"
                        style={{borderColor: 'rgba(248,113,113,0.3)', color: '#F87171', background: 'transparent', cursor: 'pointer'}}
                      >
                        Disconnect AWS account
                      </button>
                    </div>

                  </div>
                )}
              </div>
            )}

        </div>
      </div>
    </div>
  )
}