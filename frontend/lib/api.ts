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

// ── Metrics ───────────────────────────────────────────────
export const getMetrics = async () => {
  const region = getRegion()
  const token = localStorage.getItem('cg_token') || ''
  const userId = getUserId()
  const res = await fetch(
    `${API_URL}/live-metrics?region=${region}&user_id=${userId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return res.json()
}

export const getMetricsHistory = async (instanceId: string) => {
  const region = getRegion()
  const token = localStorage.getItem('cg_token') || ''
  const userId = getUserId()
  const res = await fetch(
    `${API_URL}/metrics/history?instance_id=${instanceId}&region=${region}&hours=2&user_id=${userId}`,
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
  const region = getRegion()
  const userId = getUserId()
  const res = await api.get('/anomalies', { params: { ...filters, region, user_id: userId } })
  return res.data
}

export const resolveAnomaly = async (instanceId: string, timestamp: string) => {
  const res = await api.post('/anomalies/resolve', { instance_id: instanceId, timestamp })
  return res.data
}

// ── Cost suggestions ──────────────────────────────────────
export const getCostSuggestions = async (accountId?: string) => {
  const region = getRegion()
  const userId = getUserId()
  const res = await api.get('/cost-suggestions', { params: { account_id: accountId, region, user_id: userId } })
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
  const region = getRegion()
  const userId = getUserId()
  const res = await api.get('/security-events', { params: { account_id: accountId, region, user_id: userId } })
  return res.data
}

// ── Audit logs ────────────────────────────────────────────
export const getAuditLogs = async (region?: string) => {
  const r = region || getRegion()
  const userId = getUserId()
  const res = await api.get('/audit-logs', { params: { region: r, user_id: userId } })
  return res.data
}

// ── Reports ───────────────────────────────────────────────
export const getReports = async () => {
  const userId = getUserId()
  const res = await api.get('/reports', { params: { user_id: userId } })
  return res.data
}

export const getReportContent = async (key: string) => {
  const region = getRegion()
  const userId = getUserId()
  const res = await api.get('/reports/content', { params: { key, region, user_id: userId } })
  return res.data
}

// ── Agent AI ──────────────────────────────────────────────
export const askAgent = async (message: string, context?: object) => {
  const userId = getUserId()
  const res = await api.post('/agent', { message, context, user_id: userId })
  return res.data
}

// ── AWS Account management ────────────────────────────────
export const connectAccount = async (roleArn: string, nickname: string, region: string) => {
  const userId = getUserId()
  const res = await api.post('/accounts/connect', { role_arn: roleArn, nickname, region, user_id: userId })
  return res.data
}

export const getConnectedAccount = async () => {
  const userId = getUserId()
  const res = await api.get('/accounts/me', { params: { user_id: userId } })
  return res.data
}

export const getAccounts = async () => {
  const res = await api.get('/accounts')
  return res.data
}

export default api