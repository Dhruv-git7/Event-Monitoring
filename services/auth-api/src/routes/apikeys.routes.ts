// FILE: services/auth-api/src/routes/apikeys.routes.ts
import crypto from 'crypto'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { v4 as uuid } from 'uuid'
import { db } from '../db'

function tenant(req: FastifyRequest) { return (req as any).user.tenant_id }
function userId(req: FastifyRequest) { return (req as any).user.id || (req as any).user.user_id }
function rawKey() { return `pk_${crypto.randomBytes(32).toString('hex')}` }
function hashKey(k: string) { return crypto.createHash('sha256').update(k).digest('hex') }

export default async function apiKeysRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', (fastify as any).authenticate)

  fastify.get('/api-keys', async (req, reply) => {
    try {
      const result = await db.query('SELECT id, name, key_prefix, last_used_at, created_at, revoked_at FROM api_keys WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC', [tenant(req), userId(req)])
      return { api_keys: result.rows }
    } catch (err) { req.log.error(err); return reply.code(500).send({ error: 'Failed to list API keys' }) }
  })

  fastify.post('/api-keys', async (req, reply) => {
    try {
      const body: any = req.body || {}
      const key = rawKey()
      const result = await db.query('INSERT INTO api_keys (id, tenant_id, user_id, name, key_hash, key_prefix, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id, name, key_prefix, created_at', [uuid(), tenant(req), userId(req), body.name || 'API Key', hashKey(key), key.slice(0, 10)])
      return reply.code(201).send({ api_key: result.rows[0], key })
    } catch (err) { req.log.error(err); return reply.code(500).send({ error: 'Failed to create API key' }) }
  })

  fastify.delete('/api-keys/:id', async (req, reply) => {
    try {
      const { id } = req.params as any
      await db.query('UPDATE api_keys SET revoked_at=NOW() WHERE id=$1 AND tenant_id=$2 AND user_id=$3', [id, tenant(req), userId(req)])
      return { ok: true }
    } catch (err) { req.log.error(err); return reply.code(500).send({ error: 'Failed to revoke API key' }) }
  })
}
