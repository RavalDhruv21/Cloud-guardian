export interface EC2Metric {
  instance_id: string
  cpu_avg: number
  cpu_max: number
  timestamp: string
  collected_at: string
  account_id?: string
  network_in_avg?: number
  network_out_avg?: number
  ebs_read_ops_avg?: number
  ebs_write_ops_avg?: number
  status_check_failed?: number
  mem_used_percent?: number
  disk_used_percent?: number
}

export interface Anomaly {
  instance_id: string
  timestamp: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  summary: string
  likely_cause: string
  recommended_action: string
  cost_impact: string
  resolved: boolean
  account_id?: string
  additional_recommendations?: string[]
}

export interface CostSuggestion {
  account_id: string
  timestamp: string
  resource_type: string
  resource_id: string
  issue: string
  recommendation: string
  estimated_saving: string
  severity: string
  status: 'pending' | 'dismissed' | 'resolved'
}

export interface SecurityEvent {
  event_id: string
  timestamp: string
  event_type: string
  resource_id: string
  action_taken: string
  reverted: boolean
  revert_time_seconds?: number
  needs_review: boolean
}

export interface AWSAccount {
  account_id: string
  role_arn: string
  nickname: string
  region: string
  connected_at: string
  status: 'active' | 'disconnected'
}

export interface User {
  user_id: string
  email: string
  name: string
  plan: 'free' | 'pro'
  accounts: AWSAccount[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface AgentContext {
  type: 'anomaly' | 'cost' | 'security' | 'general'
  data?: Anomaly | CostSuggestion | SecurityEvent | null
}