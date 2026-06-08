'use client'

import { useState, useEffect } from 'react'
import { Bell, Plus, Trash2, Edit2, Check, X, Mail, Zap, Shield, DollarSign } from 'lucide-react'

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
  critical: { color: '#dc2626', bg: '#fef2f2', label: 'Critical' },
  high: { color: '#ea580c', bg: '#fff7ed', label: 'High' },
  medium: { color: '#d97706', bg: '#fffbeb', label: 'Medium' },
  low: { color: '#2563eb', bg: '#eff6ff', label: 'Low' },
}

const defaultRules: AlertRule[] = [
  {
    id: '1',
    name: 'High CPU Alert',
    metric: 'cpu_utilization',
    condition: 'greater_than',
    threshold: 85,
    severity: 'critical',
    channel: 'email',
    enabled: true,
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Memory Warning',
    metric: 'memory_utilization',
    condition: 'greater_than',
    threshold: 80,
    severity: 'high',
    channel: 'email',
    enabled: true,
    created_at: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Cost Spike',
    metric: 'monthly_cost',
    condition: 'greater_than',
    threshold: 100,
    severity: 'medium',
    channel: 'email',
    enabled: false,
    created_at: new Date().toISOString(),
  },
]

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

  useEffect(() => {
    fetchRules()
  }, [])

  const fetchRules = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('cg_token') || ''
      const res = await fetch(`${API_URL}/alert-rules`, {
        headers: { Authorization: `Bearer ${token}` },
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
      const token = localStorage.getItem('cg_token') || ''
      const payload = { ...form }

      if (editingId) {
        const res = await fetch(`${API_URL}/alert-rules/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...payload } : r))
          showToast('Rule updated!')
        } else {
          // local fallback
          setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...payload } : r))
          showToast('Rule updated (local)!')
        }
      } else {
        const newRule: AlertRule = {
          ...payload,
          id: Date.now().toString(),
          created_at: new Date().toISOString(),
        }
        const res = await fetch(`${API_URL}/alert-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const data = await res.json()
          setRules(prev => [...prev, data.rule || newRule])
        } else {
          setRules(prev => [...prev, newRule])
        }
        showToast('Rule created!')
      }
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const deleteRule = async (id: string) => {
    try {
      const token = localStorage.getItem('cg_token') || ''
      await fetch(`${API_URL}/alert-rules/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
    setRules(prev => prev.filter(r => r.id !== id))
    showToast('Rule deleted')
  }

  const toggleRule = async (id: string) => {
    const rule = rules.find(r => r.id === id)
    if (!rule) return
    const updated = { ...rule, enabled: !rule.enabled }
    setRules(prev => prev.map(r => r.id === id ? updated : r))
    try {
      const token = localStorage.getItem('cg_token') || ''
      await fetch(`${API_URL}/alert-rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: !rule.enabled }),
      })
    } catch {}
    showToast(updated.enabled ? 'Rule enabled' : 'Rule disabled')
  }

  const startEdit = (rule: AlertRule) => {
    setForm({
      name: rule.name,
      metric: rule.metric,
      condition: rule.condition,
      threshold: rule.threshold,
      severity: rule.severity,
      channel: rule.channel,
      enabled: rule.enabled,
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
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 999,
          background: '#0F6E56', color: '#fff', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Bell size={20} color="#0F6E56" />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Alert Rules</h1>
          </div>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Define thresholds that trigger notifications to your email or Slack.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#0F6E56', color: '#fff', border: 'none',
            padding: '9px 16px', borderRadius: 10, fontSize: 13,
            fontWeight: 600, cursor: 'pointer'
          }}
        >
          <Plus size={15} /> New Rule
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Total Rules', value: rules.length, icon: <Bell size={14} />, color: '#185FA5' },
          { label: 'Active', value: rules.filter(r => r.enabled).length, icon: <Zap size={14} />, color: '#0F6E56' },
          { label: 'Critical', value: rules.filter(r => r.severity === 'critical').length, icon: <Shield size={14} />, color: '#dc2626' },
          { label: 'Cost Alerts', value: rules.filter(r => r.metric === 'monthly_cost').length, icon: <DollarSign size={14} />, color: '#d97706' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: s.color, marginBottom: 6 }}>
              {s.icon}
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#111' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#111' }}>
            {editingId ? '✏️ Edit Rule' : '+ New Alert Rule'}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Rule Name</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. High CPU Warning"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Metric</label>
              <select value={form.metric} onChange={e => setForm(p => ({ ...p, metric: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}>
                {metricOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Condition</label>
              <select value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}>
                {conditionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Threshold Value</label>
              <input
                type="number"
                value={form.threshold}
                onChange={e => setForm(p => ({ ...p, threshold: Number(e.target.value) }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Severity</label>
              <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value as AlertRule['severity'] }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Notification Channel</label>
              <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value as AlertRule['channel'] }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}>
                <option value="email">Email only</option>
                <option value="slack">Slack only</option>
                <option value="both">Email + Slack</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={saveRule} disabled={saving}
              style={{ background: '#0F6E56', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} /> {saving ? 'Saving...' : editingId ? 'Update Rule' : 'Create Rule'}
            </button>
            <button onClick={resetForm}
              style={{ background: '#f3f4f6', color: '#374151', border: 'none', padding: '9px 18px', borderRadius: 9, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 14 }}>Loading rules...</div>
      ) : rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
          <Bell size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>No alert rules yet. Create your first rule above.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map(rule => {
            const sev = severityConfig[rule.severity]
            return (
              <div key={rule.id} style={{
                background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0',
                padding: '16px 20px', display: 'flex', alignItems: 'center',
                gap: 16, opacity: rule.enabled ? 1 : 0.55,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
              }}>
                {/* Toggle */}
                <div onClick={() => toggleRule(rule.id)}
                  style={{
                    width: 38, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'background 0.2s',
                    background: rule.enabled ? '#0F6E56' : '#d1d5db', position: 'relative', flexShrink: 0
                  }}>
                  <div style={{
                    position: 'absolute', top: 3, left: rule.enabled ? 18 : 3,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s'
                  }} />
                </div>

                {/* Severity badge */}
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                  background: sev.bg, color: sev.color, flexShrink: 0
                }}>{sev.label}</span>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 2 }}>{rule.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {metricLabel(rule.metric)} {conditionLabel(rule.condition)} <strong>{rule.threshold}</strong>
                    {' · '}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Mail size={10} /> {rule.channel}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEdit(rule)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Edit2 size={13} color="#6b7280" />
                  </button>
                  <button onClick={() => deleteRule(rule.id)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={13} color="#dc2626" />
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