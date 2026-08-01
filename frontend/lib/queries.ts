'use client'

// Central React Query hooks for every API endpoint the dashboard reads.
// Replaces the old per-page pattern (useState + useEffect + manual fetch on
// every mount) — pages now render instantly from cache on repeat visits and
// silently revalidate in the background instead of blocking behind a
// spinner every single navigation. See QueryProvider for the shared
// staleTime/gcTime defaults.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getMetrics, getMetricsHistory,
  getAnomalies, resolveAnomaly,
  getCostSuggestions, dismissSuggestion, stopResource,
  getSecurityEvents, runSecurityScan, fixSecurityIssue,
  getAuditLogs,
  getReports,
  getComplianceScore,
  getCostForecast,
  getUserProfile, updateUserProfile,
  getConnectedAccount,
} from './api'

// Lets a caller (e.g. the dashboard, which polls every 60s) override the
// default staleTime/refetchInterval per-hook without every hook needing its
// own bespoke options param. Deliberately a plain local type rather than
// Partial<Pick<UseQueryOptions, ...>> — spreading the generic (unparameterized)
// UseQueryOptions type into useQuery() confuses TData inference and collapses
// every hook's `data` down to `{}`.
type QueryOverrides = { refetchInterval?: number; staleTime?: number; enabled?: boolean }

export const queryKeys = {
  metrics: ['metrics'] as const,
  metricsHistory: (instanceId: string) => ['metrics-history', instanceId] as const,
  anomalies: (filters?: { severity?: string; resolved?: boolean; account_id?: string }) =>
    ['anomalies', filters ?? {}] as const,
  costSuggestions: ['cost-suggestions'] as const,
  securityEvents: ['security-events'] as const,
  auditLogs: ['audit-logs'] as const,
  reports: ['reports'] as const,
  complianceScore: ['compliance-score'] as const,
  costForecast: ['cost-forecast'] as const,
  userProfile: ['user-profile'] as const,
  connectedAccount: ['connected-account'] as const,
}

// ── Metrics ───────────────────────────────────────────────
export const useMetrics = (overrides?: QueryOverrides) =>
  useQuery({ queryKey: queryKeys.metrics, queryFn: getMetrics, ...overrides })

export const useMetricsHistory = (instanceId: string | null, overrides?: QueryOverrides) =>
  useQuery({
    queryKey: queryKeys.metricsHistory(instanceId || ''),
    queryFn: () => getMetricsHistory(instanceId as string),
    enabled: !!instanceId,
    ...overrides,
  })

// ── Anomalies ─────────────────────────────────────────────
export const useAnomalies = (
  filters?: { severity?: string; resolved?: boolean; account_id?: string },
  overrides?: QueryOverrides
) => useQuery({ queryKey: queryKeys.anomalies(filters), queryFn: () => getAnomalies(filters), ...overrides })

export const useResolveAnomaly = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ instanceId, timestamp }: { instanceId: string; timestamp: string }) =>
      resolveAnomaly(instanceId, timestamp),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['anomalies'] }),
  })
}

// ── Cost suggestions ──────────────────────────────────────
export const useCostSuggestions = (overrides?: QueryOverrides) =>
  useQuery({ queryKey: queryKeys.costSuggestions, queryFn: () => getCostSuggestions(), ...overrides })

export const useDismissSuggestion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (resourceId: string) => dismissSuggestion(resourceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.costSuggestions }),
  })
}

export const useStopResource = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ resourceId, resourceType }: { resourceId: string; resourceType: string }) =>
      stopResource(resourceId, resourceType),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.costSuggestions }),
  })
}

// ── Security events ───────────────────────────────────────
export const useSecurityEvents = (overrides?: QueryOverrides) =>
  useQuery({ queryKey: queryKeys.securityEvents, queryFn: () => getSecurityEvents(), ...overrides })

export const useRunSecurityScan = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: runSecurityScan,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.securityEvents }),
  })
}

export const useFixSecurityIssue = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ issueType, resourceId }: { issueType: string; resourceId: string }) =>
      fixSecurityIssue(issueType, resourceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.securityEvents }),
  })
}

// ── Audit logs ────────────────────────────────────────────
export const useAuditLogs = () =>
  useQuery({ queryKey: queryKeys.auditLogs, queryFn: () => getAuditLogs() })

// ── Reports ───────────────────────────────────────────────
export const useReports = () =>
  useQuery({ queryKey: queryKeys.reports, queryFn: getReports, staleTime: 60_000 })

// ── Compliance / cost forecast ─────────────────────────────
export const useComplianceScore = (overrides?: QueryOverrides) =>
  useQuery({ queryKey: queryKeys.complianceScore, queryFn: getComplianceScore, staleTime: 60_000, ...overrides })

export const useCostForecast = (overrides?: QueryOverrides) =>
  useQuery({ queryKey: queryKeys.costForecast, queryFn: getCostForecast, staleTime: 60_000, ...overrides })

// ── User profile / connected account ───────────────────────
export const useUserProfile = () =>
  useQuery({ queryKey: queryKeys.userProfile, queryFn: getUserProfile })

export const useUpdateUserProfile = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateUserProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.userProfile }),
  })
}

export const useConnectedAccount = () =>
  useQuery({ queryKey: queryKeys.connectedAccount, queryFn: getConnectedAccount, staleTime: 60_000 })
