// FILE: services/auth-api/src/routes/auth.routes.ts
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { db } from '../db'
import { LoginBody, RegisterBody } from '../types'

const ACCESS_COOKIE = 'access_token'
const REFRESH_COOKIE = 'refresh_token'
const ACCESS_TTL = '15m'
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 7)
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001'

function cookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === 'true', path: '/', maxAge: maxAgeSeconds }
}

async function issueTokens(fastify: FastifyInstance, reply: FastifyReply, user: any, req: FastifyRequest) {
  const payload = { id: user.id, user_id: user.id, tenant_id: user.tenant_id, email: user.email, role: user.role, name: user.name }
  const access = fastify.jwt.sign(payload, { expiresIn: ACCESS_TTL })
  const refresh = uuid() + uuid()
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000)
  await db.query(`INSERT INTO sessions (id, user_id, refresh_token, user_agent, ip_address, expires_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())`, [uuid(), user.id, refresh, req.headers['user-agent'] || null, req.ip || null, expiresAt])
  reply.setCookie(ACCESS_COOKIE, access, cookieOptions(15 * 60))
  reply.setCookie(REFRESH_COOKIE, refresh, cookieOptions(REFRESH_DAYS * 24 * 60 * 60))
  return { access_token: access, user: payload }
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: LoginBody }>('/auth/login', async (req, reply) => {
    try {
      const { email, password } = req.body || ({} as LoginBody)
      if (!email || !password) return reply.code(400).send({ error: 'email and password are required' })
      const result = await db.query(`SELECT * FROM users WHERE lower(email)=lower($1) AND status='active' LIMIT 1`, [email])
      const user = result.rows[0]
      if (!user || !(await bcrypt.compare(password, user.password_hash))) return reply.code(401).send({ error: 'Invalid credentials' })
      await db.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id])
      return await issueTokens(fastify, reply, user, req)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Login failed' })
    }
  })

  fastify.post('/auth/logout', async (req, reply) => {
    try {
      const refresh = (req as any).cookies?.[REFRESH_COOKIE]
      if (refresh) await db.query('DELETE FROM sessions WHERE refresh_token=$1', [refresh])
      reply.clearCookie(ACCESS_COOKIE, { path: '/' })
      reply.clearCookie(REFRESH_COOKIE, { path: '/' })
      return { ok: true }
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Logout failed' })
    }
  })

  fastify.post('/auth/refresh', async (req, reply) => {
    try {
      const refresh = (req as any).cookies?.[REFRESH_COOKIE]
      if (!refresh) return reply.code(401).send({ error: 'Missing refresh token' })
      const result = await db.query(
        `SELECT s.*, u.id AS uid, u.tenant_id, u.email, u.name, u.role, u.status
         FROM sessions s JOIN users u ON u.id=s.user_id
         WHERE s.refresh_token=$1 AND s.expires_at > NOW() AND u.status='active'
         LIMIT 1`,
        [refresh]
      )
      const session = result.rows[0]
      if (!session) return reply.code(401).send({ error: 'Invalid refresh token' })
      await db.query('DELETE FROM sessions WHERE id=$1', [session.id])
      return await issueTokens(fastify, reply, { id: session.uid, tenant_id: session.tenant_id, email: session.email, name: session.name, role: session.role }, req)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Refresh failed' })
    }
  })

  fastify.get('/auth/me', { preHandler: (fastify as any).authenticate }, async (req) => {
    const user = (req as any).user
    const result = await db.query('SELECT id, tenant_id, name, email, role, status, last_login_at, created_at FROM users WHERE id=$1', [user.id || user.user_id])
    return { user: result.rows[0] || user }
  })

  fastify.post<{ Body: RegisterBody }>('/auth/register', async (req, reply) => {
    try {
      const { name, email, password } = req.body || ({} as RegisterBody)
      if (!email || !password || password.length < 8) return reply.code(400).send({ error: 'valid email and password with at least 8 characters are required' })
      const exists = await db.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email])
      if (exists.rows[0]) return reply.code(409).send({ error: 'Email already registered' })
      const hash = await bcrypt.hash(password, 12)
      const result = await db.query(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at) VALUES ($1,$2,$3,$4,$5,'viewer','active',NOW()) RETURNING id, tenant_id, name, email, role, status`,
        [uuid(), DEFAULT_TENANT_ID, name || email.split('@')[0], email, hash]
      )
      return reply.code(201).send({ user: result.rows[0] })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Registration failed' })
    }
  })
}
