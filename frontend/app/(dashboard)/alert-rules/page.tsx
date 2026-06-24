'use client'
import { useState, useEffect } from 'react'
import { getToken } from '@/lib/api'

interface AlertRule {
  id: string
  name: string
  metric: string
  condition: string
  threshold: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  channel: 'email' | 'slack' | 'both'
  enabled: boolean
  created_at: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

const metricOptions = [
  { value: 'cpu_utilization', label: 'CPU Utilization (%)' },
  { value: 'memory_utilization', label: 'Memory Utilization (%)' },
  { value: 'network_in', label: 'Network In (MB)' },
  { value: 'network_out', label: 'Network Out (MB)' },
  { value: 'disk_read', label: 'Disk Read (MB)' },
  { value: 'disk_write', label: 'Disk Write (MB)' },
  { value: 'rds_connections', label: 'RDS Connections (count)' },
  { value: 'monthly_cost', label: 'Monthly Cost ($)' },
]

const conditionOptions = [
  { value: 'greater_than', label: 'Greater than >' },
  { value: 'less_than', label: 'Less than <' },
  { value: 'equals', label: 'Equals =' },
]

const severityConfig = {
  critical: { color: '#F87171', bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.2)', label: 'Critical' },
  high:     { color: '#FBBF24', bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.2)', label: 'High' },
  medium:   { color: '#FBBF24', bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.2)', label: 'Medium' },
  low:      { color: '#60A5FA', bg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.2)', label: 'Low' },
}

const defaultRules: AlertRule[] = [
  { id: '1', name: 'High CPU Alert', metric: 'cpu_utilization', condition: 'greater_than', threshold: 85, severity: 'critical', channel: 'email', enabled: true, created_at: new Date().toISOString() },
  { id: '2', name: 'Memory Warning', metric: 'memory_utilization', condition: 'greater_than', threshold: 80, severity: 'high', channel: 'email', enabled: true, created_at: new Date().toISOString() },
  { id: '3', name: 'Cost Spike', metric: 'monthly_cost', condition: 'greater_than', threshold: 100, severity: 'medium', channel: 'email', enabled: false, created_at: new Date().toISOString() },
]

const Toggle = ({ value, onChange }: { value: boolean, onChange: () => void }) => (
  <button
    onClick={onChange}
    style={{
      width: 38, height: 22, borderRadius: 11, border: 'none',
      background: value ? '#34D399' : 'rgba(255,255,255,0.1)',
      position: 'relative', cursor: 'pointer',
      transition: 'background 0.2s', flexShrink: 0,
      boxShadow: value ? '0 0 10px rgba(52,211,153,0.3)' : 'none'
    }}
  >
    <div style={{
      position: 'absolute', top: 3,
      left: value ? 19 : 3,
      width: 16, height: 16, borderRadius: '50%',
      background: value ? '#050B18' : '#fff', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    }}/>
  </button>
)

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
  fontSize: 13, outline: 'none',
  background: 'rgba(255,255,255,0.02)', color: '#fff',
  boxSizing: 'border-box'
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8
}

export default function AlertRulesPage() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    metric: 'cpu_utilization',
    condition: 'greater_than',
    threshold: 80,
    severity: 'high' as AlertRule['severity'],
    channel: 'email' as AlertRule['channel'],
    enabled: true,
  })

  useEffect(() => { fetchRules() }, [])

  const fetchRules = async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/alert-rules`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setRules(data.rules || defaultRules)
      } else {
        setRules(defaultRules)
      }
    } catch {
      setRules(defaultRules)
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const saveRule = async () => {
    if (!form.name.trim()) return showToast('Please enter a rule name')
    setSaving(true)
    try {
      if (editingId) {
        setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...form } : r))
        showToast('Rule updated!')
      } else {
        const newRule: AlertRule = {
          ...form, id: Date.now().toString(),
          created_at: new Date().toISOString()
        }
        setRules(prev => [...prev, newRule])
        showToast('Rule created!')
      }
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const deleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id))
    showToast('Rule deleted')
  }

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  const startEdit = (rule: AlertRule) => {
    setForm({
      name: rule.name, metric: rule.metric,
      condition: rule.condition, threshold: rule.threshold,
      severity: rule.severity, channel: rule.channel, enabled: rule.enabled
    })
    setEditingId(rule.id)
    setShowForm(true)
  }

  const resetForm = () => {
    setForm({ name: '', metric: 'cpu_utilization', condition: 'greater_than', threshold: 80, severity: 'high', channel: 'email', enabled: true })
    setEditingId(null)
    setShowForm(false)
  }

  const metricLabel = (val: string) => metricOptions.find(m => m.value === val)?.label || val
  const conditionLabel = (val: string) => conditionOptions.find(c => c.value === val)?.label || val

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

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-white">Alert rules</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Define thresholds that trigger notifications to your email or Slack
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="text-xs px-5 py-2.5 rounded-lg text-white font-bold flex items-center gap-2 transition-all hover:scale-105"
          style={{background: 'linear-gradient(135deg, #0F6E56, #094d3c)', boxShadow: '0 4px 15px rgba(15,110,86,0.3)', border: 'none', cursor: 'pointer'}}
        >
          + New rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        {[
          { label: 'Total rules', value: rules.length, color: '#60A5FA', glow: 'rgba(96,165,250,0.15)' },
          { label: 'Active', value: rules.filter(r => r.enabled).length, color: '#34D399', glow: 'rgba(52,211,153,0.15)' },
          { label: 'Critical', value: rules.filter(r => r.severity === 'critical').length, color: '#F87171', glow: 'rgba(248,113,113,0.15)' },
          { label: 'Cost alerts', value: rules.filter(r => r.metric === 'monthly_cost').length, color: '#FBBF24', glow: 'rgba(251,191,36,0.15)' },
        ].map((s, i) => (
          <div key={s.label} className="auth-glass rounded-2xl p-5" style={{animationDelay: `${i * 0.1}s`}}>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">{s.label}</div>
            <div className="text-3xl font-bold" style={{color: s.color, textShadow: `0 0 15px ${s.glow}`}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="auth-glass rounded-2xl p-8 mb-8 animate-entrance" style={{border: '1px solid rgba(16,185,129,0.3)', boxShadow: '0 0 40px rgba(16,185,129,0.05)'}}>
          <div className="text-sm font-semibold uppercase tracking-wider text-emerald-400 mb-6">
            {editingId ? '✏️ Edit rule' : '+ New alert rule'}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label style={labelStyle}>Rule name</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({...p, name: e.target.value}))}
                placeholder="e.g. High CPU Warning"
                style={inputStyle}
                onFocus={e => e.currentTarget.style.borderColor = '#0F6E56'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            <div>
              <label style={labelStyle}>Metric</label>
              <select
                value={form.metric}
                onChange={e => setForm(p => ({...p, metric: e.target.value}))}
                style={selectStyle}
              >
                {metricOptions.map(o => (
                  <option key={o.value} value={o.value} style={{background: '#050B18', color: '#fff'}}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Condition</label>
              <select
                value={form.condition}
                onChange={e => setForm(p => ({...p, condition: e.target.value}))}
                style={selectStyle}
              >
                {conditionOptions.map(o => (
                  <option key={o.value} value={o.value} style={{background: '#050B18', color: '#fff'}}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Threshold value</label>
              <input
                type="number"
                value={form.threshold}
                onChange={e => setForm(p => ({...p, threshold: Number(e.target.value)}))}
                style={inputStyle}
                onFocus={e => e.currentTarget.style.borderColor = '#0F6E56'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            <div>
              <label style={labelStyle}>Severity</label>
              <select
                value={form.severity}
                onChange={e => setForm(p => ({...p, severity: e.target.value as AlertRule['severity']}))}
                style={selectStyle}
              >
                <option value="critical" style={{background: '#050B18', color: '#fff'}}>Critical</option>
                <option value="high" style={{background: '#050B18', color: '#fff'}}>High</option>
                <option value="medium" style={{background: '#050B18', color: '#fff'}}>Medium</option>
                <option value="low" style={{background: '#050B18', color: '#fff'}}>Low</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Notification channel</label>
              <select
                value={form.channel}
                onChange={e => setForm(p => ({...p, channel: e.target.value as AlertRule['channel']}))}
                style={selectStyle}
              >
                <option value="email" style={{background: '#050B18', color: '#fff'}}>Email only</option>
                <option value="slack" style={{background: '#050B18', color: '#fff'}}>Slack only</option>
                <option value="both" style={{background: '#050B18', color: '#fff'}}>Email + Slack</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <Toggle
                value={form.enabled}
                onChange={() => setForm(p => ({...p, enabled: !p.enabled}))}
              />
              <label style={{fontSize: 12, fontWeight: 600, color: '#fff'}}>
                Enable rule immediately
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-8 pt-6" style={{borderTop: '1px solid rgba(255,255,255,0.05)'}}>
            <button
              onClick={saveRule}
              disabled={saving}
              className="text-xs px-6 py-2.5 rounded-lg text-white font-bold disabled:opacity-50 transition-all hover:scale-105"
              style={{background: 'linear-gradient(135deg, #0F6E56, #094d3c)', boxShadow: '0 4px 15px rgba(15,110,86,0.3)', border: 'none', cursor: 'pointer'}}
            >
              {saving ? 'Saving...' : editingId ? 'Update rule' : 'Create rule'}
            </button>
            <button
              onClick={resetForm}
              className="text-xs px-6 py-2.5 rounded-lg font-medium transition-colors hover:bg-white/5"
              style={{background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer'}}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" style={{boxShadow: '0 0 15px rgba(16,185,129,0.2)'}}/>
            <div className="text-xs text-white/50">Loading rules...</div>
          </div>
        </div>
      ) : rules.length === 0 ? (
        <div className="auth-glass rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4 opacity-80" style={{textShadow: '0 0 20px rgba(255,255,255,0.2)'}}>🔔</div>
          <div className="text-sm font-semibold text-white mb-2">No alert rules yet</div>
          <div className="text-xs text-white/50">Create your first rule to get notified when thresholds are breached</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rules.map((rule, i) => {
            const sev = severityConfig[rule.severity]
            return (
              <div
                key={rule.id}
                className="auth-glass rounded-2xl p-5 flex items-center gap-5 transition-all hover:bg-white/5"
                style={{
                  opacity: rule.enabled ? 1 : 0.6,
                  borderLeft: rule.enabled ? `3px solid ${sev.color}` : '3px solid rgba(255,255,255,0.1)',
                  animationDelay: `${i * 0.05}s`
                }}
              >
                {/* Toggle */}
                <Toggle value={rule.enabled} onChange={() => toggleRule(rule.id)}/>

                {/* Severity badge */}
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 uppercase tracking-wider"
                  style={{background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`}}
                >
                  {sev.label}
                </span>

                {/* Rule info */}
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-white">{rule.name}</div>
                  <div className="text-xs text-white/50 mt-1.5 font-mono">
                    <span className="text-white/80">{metricLabel(rule.metric)}</span> {conditionLabel(rule.condition)} <strong className="text-emerald-400">{rule.threshold}</strong>
                    <span className="mx-2 font-sans">•</span>
                    {rule.channel === 'email' ? '📧 Email' : rule.channel === 'slack' ? '💬 Slack' : '📧💬 Email + Slack'}
                  </div>
                </div>

                {/* Status */}
                <span
                  className="text-xs px-3 py-1 rounded-full flex-shrink-0 font-bold uppercase tracking-wider"
                  style={{
                    background: rule.enabled ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                    color: rule.enabled ? '#34D399' : 'rgba(255,255,255,0.4)',
                    border: rule.enabled ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  {rule.enabled ? 'Active' : 'Paused'}
                </span>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0 ml-2">
                  <button
                    onClick={() => startEdit(rule)}
                    className="text-xs font-medium px-4 py-2 rounded-lg transition-colors hover:bg-white/10"
                    style={{border: '1px solid rgba(255,255,255,0.1)', color: '#fff', background: 'transparent', cursor: 'pointer'}}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="text-xs font-medium px-4 py-2 rounded-lg transition-colors hover:bg-red-500/10"
                    style={{border: '1px solid rgba(248,113,113,0.2)', color: '#F87171', background: 'transparent', cursor: 'pointer'}}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}