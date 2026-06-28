// FILE: services/metrics-processor/src/clickhouse.ts
import { createClient, ClickHouseClient } from '@clickhouse/client'
import { MetricRow } from './types'

const clickhouse: ClickHouseClient = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DATABASE || 'platform',
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 0
  }
})

function chDate(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').replace('Z', '')
}

export async function insertMetrics(rows: MetricRow[]) {
  if (!rows.length) return
  await clickhouse.insert({
    table: 'metrics',
    values: rows.map(r => ({
      tenant_id: r.tenant_id,
      host_id: r.host_id,
      hostname: r.hostname,
      metric_name: r.metric_name,
      value: r.value,
      unit: r.unit,
      collected_at: chDate(r.collected_at),
      received_at: chDate(r.received_at)
    })),
    format: 'JSONEachRow'
  })
}

export async function insertAlertEvent(row: { tenant_id: string; host_id: string; problem_id: string; alert_rule_id?: string | null; metric_name: string; severity: string; status: string; value: number; event_time?: string }) {
  await clickhouse.insert({
    table: 'alert_events',
    values: [{
      tenant_id: row.tenant_id,
      host_id: row.host_id,
      problem_id: row.problem_id,
      alert_rule_id: row.alert_rule_id || '',
      metric_name: row.metric_name,
      severity: row.severity,
      status: row.status,
      value: row.value,
      event_time: chDate(row.event_time || new Date().toISOString())
    }],
    format: 'JSONEachRow'
  })
}

export async function queryRange(hostId: string, metric: string, from: Date, to: Date) {
  const result = await clickhouse.query({
    query: `SELECT collected_at AS t, value AS v FROM metrics WHERE host_id = {hostId:String} AND metric_name = {metric:String} AND collected_at >= {from:DateTime} AND collected_at <= {to:DateTime} ORDER BY collected_at ASC`,
    query_params: { hostId, metric, from: chDate(from.toISOString()), to: chDate(to.toISOString()) },
    format: 'JSONEachRow'
  })
  return await result.json()
}

export async function queryHourly(hostId: string, metric: string, from: Date, to: Date) {
  const result = await clickhouse.query({
    query: `SELECT bucket AS t, avg_value AS v FROM metrics_hourly WHERE host_id = {hostId:String} AND metric_name = {metric:String} AND bucket >= {from:DateTime} AND bucket <= {to:DateTime} ORDER BY bucket ASC`,
    query_params: { hostId, metric, from: chDate(from.toISOString()), to: chDate(to.toISOString()) },
    format: 'JSONEachRow'
  })
  return await result.json()
}

export function unitForMetric(name: string): string {
  if (name.endsWith('_usage')) return '%'
  if (name.endsWith('_mb')) return 'MB'
  if (name.endsWith('_gb')) return 'GB'
  if (name.endsWith('_mbps')) return 'Mbps'
  if (name.endsWith('_bytes')) return 'B/s'
  if (name.endsWith('_secs')) return 's'
  if (name === 'processes') return 'count'
  return ''
}

export async function closeClickHouse() {
  await clickhouse.close()
}
