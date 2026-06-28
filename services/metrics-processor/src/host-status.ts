// FILE: services/metrics-processor/src/host-status.ts
import { Pool } from 'pg'
import { HostStatus } from './types'

export async function determineHostStatus(db: Pool, hostId: string): Promise<HostStatus> {
  const hostResult = await db.query(`SELECT last_seen FROM hosts WHERE id=$1`, [hostId])
  const lastSeen = hostResult.rows[0]?.last_seen ? new Date(hostResult.rows[0].last_seen).getTime() : 0
  if (!lastSeen || Date.now() - lastSeen > 120000) return 'offline'

  const result = await db.query(
    `SELECT severity FROM problems WHERE host_id=$1 AND status IN ('active','acknowledged')`,
    [hostId]
  )
  if (result.rows.some((r: any) => r.severity === 'critical' && r.status !== 'acknowledged')) return 'critical'
  if (result.rows.some((r: any) => r.severity === 'critical')) return 'critical'
  if (result.rows.some((r: any) => r.severity === 'warning')) return 'warning'
  return 'online'
}
