import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Metrics
export const getMetrics = async (accountId?: string) => {
  const region = typeof window !== 'undefined' ? localStorage.getItem('selected_region') || 'us-east-1' : 'us-east-1'
  const res = await api.get('/metrics', { params: { account_id: accountId, region } })
  return res.data
}

export const getMetricsHistory = async (instanceId: string) => {
  const region = typeof window !== 'undefined'
    ? localStorage.getItem('selected_region') || 'us-east-1'
    : 'us-east-1'
  const res = await api.get('/metrics/history', {
    params: { instance_id: instanceId, region }
  })
  return res.data
}

// Anomalies
export const getAnomalies = async (filters?: {
  severity?: string
  resolved?: boolean
  account_id?: string
}) => {
  const region = typeof window !== 'undefined' ? localStorage.getItem('selected_region') || 'us-east-1' : 'us-east-1'
  const res = await api.get('/anomalies', { params: { ...filters, region } })
  return res.data
}

export const resolveAnomaly = async (instanceId: string, timestamp: string) => {
  const res = await api.post('/anomalies/resolve', { instance_id: instanceId, timestamp })
  return res.data
}

// Cost suggestions
export const getCostSuggestions = async (accountId?: string) => {
  const region = typeof window !== 'undefined' ? localStorage.getItem('selected_region') || 'us-east-1' : 'us-east-1'
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

// Security events
export const getSecurityEvents = async (accountId?: string) => {
  const region = typeof window !== 'undefined' ? localStorage.getItem('selected_region') || 'us-east-1' : 'us-east-1'
  const res = await api.get('/security-events', { params: { account_id: accountId, region } })
  return res.data
}

//Audit logs

export const getAuditLogs = async (region?: string) => {
  const r = region || (typeof window !== 'undefined' ? localStorage.getItem('selected_region') || 'us-east-1' : 'us-east-1')
  const res = await api.get('/audit-logs', { params: { region: r } })
  return res.data
}

// Reports
export const getReports = async () => {
  const res = await api.get('/reports')
  return res.data
}

// Agent AI
export const askAgent = async (message: string, context?: object) => {
  const res = await api.post('/agent', { message, context })
  return res.data
}

// AWS Account management
export const connectAccount = async (roleArn: string, nickname: string, region: string) => {
  const res = await api.post('/accounts/connect', { role_arn: roleArn, nickname, region })
  return res.data
}

export const getAccounts = async () => {
  const res = await api.get('/accounts')
  return res.data
}

export default api