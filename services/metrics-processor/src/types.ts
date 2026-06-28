// FILE: services/metrics-processor/src/types.ts
export type HostStatus = 'online' | 'offline' | 'warning' | 'critical' | 'unknown'
export type ProblemSeverity = 'warning' | 'critical'

export interface ServiceCheck {
  name: string
  port?: number
  running: boolean
}

export interface RawMetricPayload {
  host_id: string
  tenant_id: string
  hostname: string
  ip_address?: string
  agent_version?: string
  metrics: Record<string, number>
  services: ServiceCheck[]
  collected_at: string
  received_at: string
}

export interface MetricRow {
  tenant_id: string
  host_id: string
  hostname: string
  metric_name: string
  value: number
  unit: string
  collected_at: string
  received_at: string
}

export interface AlertRule {
  id: string
  tenant_id: string
  host_id?: string | null
  host_group_id?: string | null
  name: string
  metric_name: string
  condition: string
  warn_value?: number | null
  crit_value?: number | null
  duration_secs: number
  is_enabled: boolean
  notify_channels: any
}

export interface Problem {
  id: string
  tenant_id: string
  host_id: string
  alert_rule_id?: string | null
  metric_name: string
  severity: ProblemSeverity
  status: string
  title: string
  description: string
  trigger_value: number
  triggered_at: string
  resolved_at?: string | null
  acknowledged_at?: string | null
  acknowledged_by?: string | null
  hostname?: string
}

export interface AlertEvaluationResult {
  opened: Problem[]
  resolved: string[]
}
