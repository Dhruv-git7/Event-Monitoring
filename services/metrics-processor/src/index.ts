// FILE: services/metrics-processor/src/index.ts
import { Kafka } from 'kafkajs'
import Redis from 'ioredis'
import { v4 as uuid } from 'uuid'
import { db, closeDb } from './db'
import { closeClickHouse, insertMetrics, unitForMetric } from './clickhouse'
import { evaluateAlerts } from './alert-evaluator'
import { determineHostStatus } from './host-status'
import { MetricRow, RawMetricPayload } from './types'

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
const RAW_TOPIC = process.env.RAW_METRICS_TOPIC || 'raw-metrics'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

const kafka = new Kafka({ clientId: 'metrics-processor', brokers: KAFKA_BROKERS })
const consumer = kafka.consumer({ groupId: 'metrics-processor' })
const redis = new Redis(REDIS_URL)

function normalize(metrics: Record<string, any>): Record<string, number> {
  const out: Record<string, number> = {}
  Object.entries(metrics || {}).forEach(([k, v]) => {
    const n = Number(v)
    if (Number.isFinite(n)) out[k] = n
  })
  if (out.ram_usage === undefined && out.ram_total_mb > 0) out.ram_usage = (out.ram_used_mb / out.ram_total_mb) * 100
  if (out.disk_usage === undefined && out.disk_total_gb > 0) out.disk_usage = (out.disk_used_gb / out.disk_total_gb) * 100
  if (out.net_in_mbps === undefined && out.net_in_bytes !== undefined) out.net_in_mbps = (out.net_in_bytes * 8) / 1_000_000
  if (out.net_out_mbps === undefined && out.net_out_bytes !== undefined) out.net_out_mbps = (out.net_out_bytes * 8) / 1_000_000
  return out
}

function metricRows(payload: RawMetricPayload): MetricRow[] {
  return Object.entries(payload.metrics)
    .filter(([, v]) => Number.isFinite(v))
    .map(([metric_name, value]) => ({
      tenant_id: payload.tenant_id,
      host_id: payload.host_id,
      hostname: payload.hostname,
      metric_name,
      value,
      unit: unitForMetric(metric_name),
      collected_at: payload.collected_at,
      received_at: payload.received_at
    }))
}

async function insertPostgresMetrics(rows: MetricRow[]) {
  if (!rows.length) return
  const params: any[] = []
  const values = rows.map((r, i) => {
    const b = i * 7
    params.push(uuid(), r.host_id, r.metric_name, r.value, r.unit, r.collected_at, r.received_at)
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`
  })
  await db.query(`INSERT INTO metric_values (id, host_id, metric_name, value, unit, collected_at, received_at) VALUES ${values.join(',')}`, params)
}

async function upsertDefinitions(rows: MetricRow[]) {
  for (const r of rows) {
    await db.query(
      `INSERT INTO metric_definitions (id, tenant_id, host_id, name, display_name, unit, category, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (host_id, name) DO UPDATE SET unit=EXCLUDED.unit`,
      [uuid(), r.tenant_id, r.host_id, r.metric_name, r.metric_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), r.unit, category(r.metric_name)]
    )
  }
}

function category(name: string): string {
  if (name.includes('cpu') || name.includes('load')) return 'cpu'
  if (name.includes('ram') || name.includes('memory')) return 'memory'
  if (name.includes('disk')) return 'disk'
  if (name.includes('net')) return 'network'
  return 'system'
}

async function upsertServices(payload: RawMetricPayload) {
  for (const svc of payload.services || []) {
    await db.query(
      `INSERT INTO host_services (id, host_id, name, port, status, checked_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (host_id, name) DO UPDATE SET port=EXCLUDED.port, status=EXCLUDED.status, checked_at=NOW()`,
      [uuid(), payload.host_id, svc.name, svc.port || null, svc.running ? 'running' : 'stopped']
    )
  }
}

async function processPayload(payload: RawMetricPayload) {
  payload.metrics = normalize(payload.metrics)
  const rows = metricRows(payload)
  await insertPostgresMetrics(rows)
  await upsertDefinitions(rows)
  await insertMetrics(rows)
  await upsertServices(payload)
  await db.query(`UPDATE hosts SET last_seen=$2, agent_version=COALESCE($3, agent_version), ip_address=COALESCE($4, ip_address) WHERE id=$1`, [payload.host_id, payload.received_at, payload.agent_version || null, payload.ip_address || null])
  const changes = await evaluateAlerts(db, payload.tenant_id, payload.host_id, payload.hostname, payload.metrics)
  const status = await determineHostStatus(db, payload.host_id)
  await db.query(`UPDATE hosts SET status=$2 WHERE id=$1`, [payload.host_id, status])

  const message = {
    host_id: payload.host_id,
    hostId: payload.host_id,
    hostname: payload.hostname,
    status,
    metrics: payload.metrics,
    timestamp: payload.received_at,
    problems_changed: changes.opened.length > 0 || changes.resolved.length > 0,
    opened: changes.opened,
    resolved: changes.resolved
  }
  await redis.publish(`metrics:${payload.host_id}`, JSON.stringify(message))
  if (message.problems_changed) await redis.publish('problems:global', JSON.stringify({ type: 'problems_changed', opened: changes.opened, resolved: changes.resolved, timestamp: payload.received_at }))
}

async function start() {
  await db.query('SELECT 1')
  await redis.ping()
  await consumer.connect()
  await consumer.subscribe({ topic: RAW_TOPIC, fromBeginning: false })
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return
      const payload = JSON.parse(message.value.toString()) as RawMetricPayload
      await processPayload(payload)
      console.log(`[metrics-processor] processed ${payload.hostname} ${payload.host_id}`)
    }
  })
}

process.on('SIGTERM', async () => {
  await consumer.disconnect().catch(() => undefined)
  await redis.quit().catch(() => undefined)
  await closeClickHouse().catch(() => undefined)
  await closeDb().catch(() => undefined)
  process.exit(0)
})

start().catch(err => {
  console.error(err)
  process.exit(1)
})
