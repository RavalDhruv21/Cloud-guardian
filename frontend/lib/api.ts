import axios from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
})

// ── Dynamically fetch fresh token from AWS Amplify or Fallback to Custom Refresher ──────────
const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    // Add 1 minute buffer
    return (payload.exp * 1000) < (Date.now() + 60000)
  } catch {
    return true
  }
}

export const getToken = async (): Promise<string> => {
  // 1. Try Amplify first (for Email/Password users)
  try {
    const session = await fetchAuthSession()
    const token = session.tokens?.accessToken?.toString() || ''
    if (token) return token
  } catch {
    // Amplify session not found, fallback to custom localStorage below
  }

  // 2. Custom Hybrid Refresher (for Google users)
  if (typeof window === 'undefined') return ''
  
  let token = localStorage.getItem('cg_token')
  if (!token) {
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/auth')) {
      localStorage.clear()
      window.location.href = '/login'
    }
    return ''
  }

  // Check if token is expired
  if (isTokenExpired(token)) {
    const refreshToken = localStorage.getItem('cg_refresh_token')
    if (!refreshToken) {
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/auth')) {
        localStorage.clear()
        window.location.href = '/login'
      }
      return ''
    }

    try {
      // Refresh the token manually
      const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
      const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
      
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId!,
        refresh_token: refreshToken
      })

      const res = await fetch(`https://${domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      })

      if (!res.ok) throw new Error('Refresh failed')
      
      const tokens = await res.json()
      if (tokens.access_token) {
        token = tokens.access_token as string
        localStorage.setItem('cg_token', token || '')
      } else {
        throw new Error('No access token in refresh response')
      }
    } catch (err) {
      console.error('Failed to refresh token manually:', err)
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/auth')) {
        localStorage.clear()
        window.location.href = '/login'
      }
      return ''
    }
  }

  return token || ''
}

// Add auth token to every axios request dynamically
api.interceptors.request.use(async (config) => {
  const token = await getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const getRegion = () =>
  typeof window !== 'undefined' ? localStorage.getItem('selected_region') || 'us-east-1' : 'us-east-1'

const isLocalConnected = () => {
  if (typeof window === 'undefined') return true;
  if (localStorage.getItem('aws_connected') === 'true') return true
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
  const token = await getToken()
  const res = await fetch(
    `${API_URL}/live-metrics?region=${region}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return res.json()
}

export const getMetricsHistory = async (instanceId: string) => {
  if (!isLocalConnected()) return { history: [] };
  const region = getRegion()
  const token = await getToken()
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

export const disconnectAccount = async () => {
  const res = await api.post('/accounts/disconnect')
  return res.data
}

// ── Security scan (on-demand) ─────────────────────────────
export const runSecurityScan = async () => {
  const res = await api.post('/security/scan')
  return res.data
}

export const fixSecurityIssue = async (issueType: string, resourceId: string) => {
  const res = await api.post('/security/fix', { issue_type: issueType, resource_id: resourceId })
  return res.data
}

// ── Compliance score ──────────────────────────────────────
export const getComplianceScore = async () => {
  if (!isLocalConnected()) return { score: null, violations: [], account_id: null }
  const res = await api.get('/compliance-score')
  return res.data
}

// ── Cost forecast ─────────────────────────────────────────
export const getCostForecast = async () => {
  if (!isLocalConnected()) return { forecast: null, account_id: null }
  const res = await api.get('/cost-forecast')
  return res.data
}

// ── User Profile ──────────────────────────────────────────
export const getUserProfile = async () => {
  const res = await api.get('/users/profile')
  return res.data
}

export const updateUserProfile = async (profileData: {
  name: string; email: string; avatar_initials: string
  company?: string; role?: string; timezone?: string
  notification_email?: string; slack_webhook?: string
  alert_email?: boolean; alert_slack?: boolean
}) => {
  const res = await api.post('/users/profile', profileData)
  return res.data
}

export default api