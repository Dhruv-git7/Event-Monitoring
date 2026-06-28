// FILE: services/ws-gateway/src/types.ts
export interface MetricUpdateEvent {
  hostId: string
  hostname: string
  metrics: Record<string, number>
  timestamp: string
}

export interface HostStatusEvent {
  hostId: string
  hostname: string
  status: 'online' | 'offline' | 'warning' | 'critical' | 'unknown'
}

export interface ProblemOpenedEvent {
  problem: any
}

export interface ProblemResolvedEvent {
  problemId: string
  hostId: string
}

export interface HeartbeatEvent {
  hostId: string
  timestamp: string
}
