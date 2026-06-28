// FILE: services/agent-api/src/index.ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Kafka, Producer } from 'kafkajs'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { v4 as uuid } from 'uuid'
import { AgentCheckinBody, AgentHeartbeatBody, AgentRegisterBody, HostRecord, RawMetricPayload } from './types'

const PORT = Number(process.env.AGENT_API_PORT || process.env.PORT || 4000)
const PG_URL = process.env.PG_URL || 'postgresql://platform:platform@localhost:5432/platform'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
const RAW_TOPIC = process.env.RAW_METRICS_TOPIC || 'raw-metrics'
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001'
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || 'http://localhost:3000'

const app = Fastify({ logger: true })
const db = new Pool({ connectionString: PG_URL })
const redis = new Redis(REDIS_URL)
const kafka = new Kafka({ clientId: 'agent-api', brokers: KAFKA_BROKERS })
let producer: Producer

function createAgentKey(): string {
  return `ak_${uuid().replace(/-/g, '')}_${uuid().replace(/-/g, '').slice(0, 16)}`
}

function requestIp(req: any): string | null {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim()
  return req.ip || req.socket?.remoteAddress || null
}

function normalizeIp(body: any, req: any): string | null {
  return body.ip_address || body.ip || requestIp(req)
}

async function findHost(agentKey: string): Promise<HostRecord | null> {
  if (!agentKey) return null
  const result = await db.query(
    `SELECT id, tenant_id, host_group_id, hostname, display_name, ip_address, os_type, os_version, agent_key, agent_version, status
     FROM hosts
     WHERE agent_key = $1
     LIMIT 1`,
    [agentKey]
  )
  return result.rows[0] || null
}

async function requireHost(agentKey: string): Promise<HostRecord> {
  const host = await findHost(agentKey)
  if (!host) {
    const err: any = new Error('Invalid agent_key')
    err.statusCode = 401
    throw err
  }
  return host
}

function normalizeMetrics(metrics: Record<string, any>): Record<string, number> {
  const out: Record<string, number> = {}
  Object.entries(metrics || {}).forEach(([key, value]) => {
    const n = Number(value)
    if (Number.isFinite(n)) out[key] = n
  })
  if (out.ram_usage === undefined && out.ram_total_mb > 0 && out.ram_used_mb >= 0) out.ram_usage = (out.ram_used_mb / out.ram_total_mb) * 100
  if (out.disk_usage === undefined && out.disk_total_gb > 0 && out.disk_used_gb >= 0) out.disk_usage = (out.disk_used_gb / out.disk_total_gb) * 100
  if (out.net_in_mbps === undefined && out.net_in_bytes !== undefined) out.net_in_mbps = (out.net_in_bytes * 8) / 1_000_000
  if (out.net_out_mbps === undefined && out.net_out_bytes !== undefined) out.net_out_mbps = (out.net_out_bytes * 8) / 1_000_000
  return out
}

async function ensureTopic() {
  const admin = kafka.admin()
  await admin.connect()
  try {
    await admin.createTopics({ topics: [{ topic: RAW_TOPIC, numPartitions: 3, replicationFactor: 1 }], waitForLeaders: true })
  } catch (err) {
    app.log.info('Kafka topic already exists or could not be created immediately')
  } finally {
    await admin.disconnect()
  }
}

async function publishPayload(payload: RawMetricPayload) {
  await producer.send({ topic: RAW_TOPIC, messages: [{ key: payload.host_id, value: JSON.stringify(payload) }] })
}

app.register(cors, { origin: DASHBOARD_ORIGIN === '*' ? true : DASHBOARD_ORIGIN, credentials: true })

app.get('/health', async () => ({ ok: true, service: 'agent-api', time: new Date().toISOString() }))

app.post<{ Body: AgentRegisterBody }>('/agent/register', async (req, reply) => {
  try {
    const body = req.body || ({} as AgentRegisterBody)
    if (!body.hostname || body.hostname.trim().length < 2) return reply.code(400).send({ error: 'hostname is required' })
    const id = uuid()
    const agentKey = createAgentKey()
    const ip = normalizeIp(body, req)
    const result = await db.query(
      `INSERT INTO hosts (id, tenant_id, host_group_id, hostname, display_name, ip_address, os_type, os_version, agent_key, agent_version, status, last_seen, registered_at, tags, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'unknown',NULL,NOW(),$11,$12)
       RETURNING *`,
      [id, DEFAULT_TENANT_ID, body.host_group_id || null, body.hostname.trim(), body.display_name || body.hostname.trim(), ip, body.os_type || 'unknown', body.os_version || null, agentKey, body.agent_version || null, body.tags || [], body.metadata || {}]
    )
    await db.query(`INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, details, created_at) VALUES ($1,$2,NULL,'agent.register','host',$3,$4,$5,NOW())`, [uuid(), DEFAULT_TENANT_ID, id, ip, { hostname: body.hostname }])
    return reply.code(201).send({ host: result.rows[0], agent_key: agentKey })
  } catch (err: any) {
    req.log.error(err)
    return reply.code(500).send({ error: 'Failed to register agent' })
  }
})

app.post<{ Body: AgentHeartbeatBody }>('/agent/heartbeat', async (req, reply) => {
  try {
    const body = req.body || ({} as AgentHeartbeatBody)
    const host = await requireHost(body.agent_key)
    const ip = normalizeIp(body, req)
    await db.query(`INSERT INTO heartbeats (id, host_id, agent_version, ip_address, received_at) VALUES ($1,$2,$3,$4,NOW())`, [uuid(), host.id, body.agent_version || host.agent_version || null, ip])
    await db.query(`UPDATE hosts SET last_seen=NOW(), ip_address=COALESCE($2, ip_address), agent_version=COALESCE($3, agent_version), status=CASE WHEN status='offline' THEN 'online' ELSE status END WHERE id=$1`, [host.id, ip, body.agent_version || null])
    await redis.publish(`metrics:${host.id}`, JSON.stringify({ type: 'heartbeat', host_id: host.id, hostname: body.hostname || host.hostname, timestamp: new Date().toISOString() }))
    return { ok: true, host_id: host.id, received_at: new Date().toISOString() }
  } catch (err: any) {
    req.log.warn(err)
    return reply.code(err.statusCode || 500).send({ error: err.statusCode === 401 ? 'Invalid agent_key' : 'Failed to process heartbeat' })
  }
})

app.post<{ Body: AgentCheckinBody }>('/agent/checkin', async (req, reply) => {
  try {
    const body = req.body || ({} as AgentCheckinBody)
    if (!body.metrics || typeof body.metrics !== 'object') return reply.code(400).send({ error: 'metrics object is required' })
    const host = await requireHost(body.agent_key)
    const receivedAt = new Date().toISOString()
    const collectedAt = body.collected_at ? new Date(body.collected_at).toISOString() : receivedAt
    const payload: RawMetricPayload = {
      host_id: host.id,
      tenant_id: host.tenant_id,
      hostname: body.hostname || host.hostname,
      ip_address: normalizeIp(body, req) || undefined,
      agent_version: body.agent_version || host.agent_version || undefined,
      metrics: normalizeMetrics(body.metrics),
      services: Array.isArray(body.services) ? body.services.map(s => ({ name: String(s.name), port: s.port ? Number(s.port) : undefined, running: !!s.running })) : [],
      collected_at: collectedAt,
      received_at: receivedAt
    }
    await publishPayload(payload)
    return { ok: true, queued: true, host_id: host.id, received_at: receivedAt }
  } catch (err: any) {
    req.log.warn(err)
    return reply.code(err.statusCode || 500).send({ error: err.statusCode === 401 ? 'Invalid agent_key' : 'Failed to process checkin' })
  }
})

app.post('/ingest', async (req, reply) => {
  try {
    const body: any = req.body || {}
    if (!body.agent_key) return reply.code(400).send({ error: 'agent_key is required' })
    const host = await requireHost(body.agent_key)
    const receivedAt = new Date().toISOString()
    const payload: RawMetricPayload = {
      host_id: host.id,
      tenant_id: host.tenant_id,
      hostname: body.hostname || host.hostname,
      ip_address: normalizeIp(body, req) || undefined,
      agent_version: body.agent_version || host.agent_version || undefined,
      metrics: normalizeMetrics(body.metrics || body),
      services: Array.isArray(body.services) ? body.services : [],
      collected_at: body.collected_at ? new Date(body.collected_at).toISOString() : receivedAt,
      received_at: receivedAt
    }
    await publishPayload(payload)
    return { ok: true, queued: true, host_id: host.id }
  } catch (err: any) {
    req.log.warn(err)
    return reply.code(err.statusCode || 500).send({ error: err.statusCode === 401 ? 'Invalid agent_key' : 'Failed to ingest payload' })
  }
})

async function start() {
  await db.query('SELECT 1')
  await redis.ping()
  producer = kafka.producer()
  await producer.connect()
  await ensureTopic()
  await app.listen({ port: PORT, host: '0.0.0.0' })
}

process.on('SIGTERM', async () => {
  await producer?.disconnect().catch(() => undefined)
  await redis.quit().catch(() => undefined)
  await db.end().catch(() => undefined)
  await app.close().catch(() => undefined)
  process.exit(0)
})

start().catch(err => {
  app.log.error(err)
  process.exit(1)
})
