// FILE: services/auth-api/src/middleware/authenticate.ts
import crypto from 'crypto'
import { FastifyReply, FastifyRequest } from 'fastify'
import { db } from '../db'

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    const apiKey = req.headers['x-api-key']
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      const hash = crypto.createHash('sha256').update(apiKey).digest('hex')
      const result = await db.query(
        `SELECT ak.id, ak.tenant_id, ak.user_id, u.email, u.name, u.role
         FROM api_keys ak
         JOIN users u ON u.id = ak.user_id
         WHERE ak.key_hash=$1 AND ak.revoked_at IS NULL AND u.status='active'
         LIMIT 1`,
        [hash]
      )
      if (result.rows[0]) {
        await db.query('UPDATE api_keys SET last_used_at=NOW() WHERE id=$1', [result.rows[0].id])
        ;(req as any).user = { id: result.rows[0].user_id, user_id: result.rows[0].user_id, tenant_id: result.rows[0].tenant_id, email: result.rows[0].email, name: result.rows[0].name, role: result.rows[0].role }
        return
      }
    }

    const token = (req as any).cookies?.access_token || (req as any).cookies?.accessToken
    const auth = req.headers.authorization
    const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null
    const jwtToken = token || bearer
    if (!jwtToken) return reply.code(401).send({ error: 'Unauthorized' })
    const decoded = await (req.server as any).jwt.verify(jwtToken)
    ;(req as any).user = decoded
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply, done: Function) {
  const user = (req as any).user
  if (!user || user.role !== 'admin') {
    reply.code(403).send({ error: 'Admin role required' })
    return
  }
  done()
}
