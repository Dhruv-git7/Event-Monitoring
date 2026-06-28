// FILE: services/ws-gateway/src/index.ts
import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import Redis from 'ioredis'

const PORT = Number(process.env.WS_GATEWAY_PORT || process.env.PORT || 4001)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || 'http://localhost:3000'

const app = express()
app.use(cors({ origin: DASHBOARD_ORIGIN === '*' ? true : DASHBOARD_ORIGIN, credentials: true }))
app.get('/health', (_req, res) => res.json({ ok: true, service: 'ws-gateway', time: new Date().toISOString() }))

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: DASHBOARD_ORIGIN === '*' ? true : DASHBOARD_ORIGIN, credentials: true },
  transports: ['websocket', 'polling']
})

const redis = new Redis(REDIS_URL)
const subscriber = new Redis(REDIS_URL)

io.on('connection', socket => {
  socket.on('subscribe', (hostId: string) => {
    if (typeof hostId === 'string' && hostId.length > 0) socket.join(hostId)
  })
  socket.on('subscribe_all', () => socket.join('all'))
  socket.on('unsubscribe', (hostId: string) => {
    if (typeof hostId === 'string' && hostId.length > 0) socket.leave(hostId)
  })
  socket.on('unsubscribe_all', () => socket.leave('all'))
})

subscriber.psubscribe('metrics:*', 'problems:*', err => {
  if (err) console.error('[ws-gateway] Redis psubscribe failed', err)
})

subscriber.on('pmessage', (_pattern, channel, message) => {
  try {
    const payload = JSON.parse(message)
    if (channel.startsWith('metrics:')) {
      const hostId = channel.split(':')[1]
      if (payload.type === 'heartbeat') {
        const evt = { hostId: payload.host_id || payload.hostId || hostId, timestamp: payload.timestamp }
        io.to(hostId).emit('heartbeat', evt)
        io.to('all').emit('heartbeat', evt)
        return
      }
      const metricEvent = { hostId, hostname: payload.hostname, metrics: payload.metrics || {}, timestamp: payload.timestamp }
      const statusEvent = { hostId, hostname: payload.hostname, status: payload.status }
      io.to(hostId).emit('metric_update', metricEvent)
      io.to('all').emit('metric_update', metricEvent)
      io.to(hostId).emit('host_status', statusEvent)
      io.to('all').emit('host_status', statusEvent)
      for (const problem of payload.opened || []) {
        io.to(hostId).emit('problem_opened', { problem })
        io.to('all').emit('problem_opened', { problem })
      }
      for (const problemId of payload.resolved || []) {
        io.to(hostId).emit('problem_resolved', { problemId, hostId })
        io.to('all').emit('problem_resolved', { problemId, hostId })
      }
    } else if (channel === 'problems:global') {
      io.to('all').emit('problems_changed', payload)
    }
  } catch (err) {
    console.error('[ws-gateway] invalid Redis message', err)
  }
})

server.listen(PORT, '0.0.0.0', async () => {
  await redis.ping()
  console.log(`[ws-gateway] listening on ${PORT}`)
})

process.on('SIGTERM', async () => {
  await subscriber.quit().catch(() => undefined)
  await redis.quit().catch(() => undefined)
  server.close(() => process.exit(0))
})
