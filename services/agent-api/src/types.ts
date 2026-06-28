// FILE: services/agent-api/src/types.ts
export interface AgentRegisterBody {
  hostname: string
  ip?: string
  ip_address?: string
  os_type?: string
  os_version?: string
  agent_version?: string
  display_name?: string
  host_group_id?: string
  tags?: string[]
  metadata?: Record<string, any>
}

export interface AgentHeartbeatBody {
  agent_key: string
  hostname?: string
  ip?: string
  ip_address?: string
  agent_version?: string
}

export interface ServiceCheck {
  name: string
  port?: number
  running: boolean
}

export interface AgentCheckinBody {
  agent_key: string
  hostname?: string
  ip_address?: string
  ip?: string
  agent_version?: string
  collected_at?: string
  metrics: Record<string, number>
  services?: ServiceCheck[]
}

export interface HostRecord {
  id: string
  tenant_id: string
  host_group_id?: string | null
  hostname: string
  display_name?: string | null
  ip_address?: string | null
  os_type?: string | null
  os_version?: string | null
  agent_key: string
  agent_version?: string | null
  status: string
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
