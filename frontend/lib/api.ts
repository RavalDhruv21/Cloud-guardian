import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
})

// ── Get current user's unique ID from JWT token ───────────
export const getUserId = (): string => {
  try {
    const token = localStorage.getItem('cg_token')
    if (!token) return 'default-user'
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.sub || 'default-user'
  } catch {
    return 'default-user'
  }
}

// Add auth token to every axios request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cg_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const getRegion = () =>
  typeof window !== 'undefined' ? localStorage.getItem('selected_region') || 'us-east-1' : 'us-east-1'

const isLocalConnected = () => {
  if (typeof window === 'undefined') return true;
  try {
    const stored = localStorage.getItem('cg_user_profile')
    if (!stored) return false;
    const profile = JSON.parse(stored)
    return !!(profile.aws_account_id || profile.aws_role_arn)
  } catch { return false }
}

// ── Metrics ───────────────────────────────────────────────
export const getMetrics = async () => {
  if (!isLocalConnected()) return { metrics: [] };
  const region = getRegion()
  const token = localStorage.getItem('cg_token') || ''
  const res = await fetch(
    `${API_URL}/live-metrics?region=${region}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return res.json()
}

export const getMetricsHistory = async (instanceId: string) => {
  if (!isLocalConnected()) return { history: [] };
  const region = getRegion()
  const token = localStorage.getItem('cg_token') || ''
  const res = await fetch(
    `${API_URL}/metrics/history?instance_id=${instanceId}&region=${region}&hours=2`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return res.json()
}

// ── Anomalies ─────────────────────────────────────────────
export const getAnomalies = async (filters?: {
  severity?: string
  resolved?: boolean
  account_id?: string
}) => {
  if (!isLocalConnected()) return { anomalies: [] };
  const region = getRegion()
  const res = await api.get('/anomalies', { params: { ...filters, region } })
  return res.data
}

export const resolveAnomaly = async (instanceId: string, timestamp: string) => {
  const res = await api.post('/anomalies/resolve', { instance_id: instanceId, timestamp })
  return res.data
}

// ── Cost suggestions ──────────────────────────────────────
export const getCostSuggestions = async (accountId?: string) => {
  if (!isLocalConnected()) return { suggestions: [] };
  const region = getRegion()
  const res = await api.get('/cost-suggestions', { params: { account_id: accountId, region } })
  return res.data
}

export const dismissSuggestion = async (resourceId: string) => {
  const res = await api.post('/cost-suggestions/dismiss', { resource_id: resourceId })
  return res.data
}

export const stopResource = async (resourceId: string, resourceType: string) => {
  const res = await api.post('/cost-suggestions/stop', { resource_id: resourceId, resource_type: resourceType })
  return res.data
}

// ── Security events ───────────────────────────────────────
export const getSecurityEvents = async (accountId?: string) => {
  if (!isLocalConnected()) return { events: [] };
  const region = getRegion()
  const res = await api.get('/security-events', { params: { account_id: accountId, region } })
  return res.data
}

// ── Audit logs ────────────────────────────────────────────
export const getAuditLogs = async (region?: string) => {
  if (!isLocalConnected()) return { logs: [] };
  const r = region || getRegion()
  const res = await api.get('/audit-logs', { params: { region: r } })
  return res.data
}

// ── Reports ───────────────────────────────────────────────
export const getReports = async () => {
  if (!isLocalConnected()) return { reports: [] };
  const res = await api.get('/reports')
  return res.data
}

export const getReportContent = async (key: string) => {
  const region = getRegion()
  const res = await api.get('/reports/content', { params: { key, region } })
  return res.data
}

// ── Agent AI ──────────────────────────────────────────────
export const askAgent = async (message: string, context?: object, history?: object[]) => {
  const res = await api.post('/agent', { message, context, history })
  return res.data
}

// ── AWS Account management ────────────────────────────────
export const connectAccount = async (roleArn: string, nickname: string, region: string) => {
  const res = await api.post('/accounts/connect', { role_arn: roleArn, nickname, region })
  return res.data
}

export const getConnectedAccount = async () => {
  const res = await api.get('/accounts/me')
  return res.data
}

export const getAccounts = async () => {
  const res = await api.get('/accounts')
  return res.data
}

// ── User Profile ──────────────────────────────────────────
export const getUserProfile = async () => {
  const res = await api.get('/users/profile')
  return res.data
}

export const updateUserProfile = async (profileData: { name: string; email: string; avatar_initials: string }) => {
  const res = await api.post('/users/profile', profileData)
  return res.data
}

export default api