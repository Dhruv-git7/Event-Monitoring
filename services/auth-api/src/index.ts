// FILE: services/auth-api/src/index.ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { authenticate } from './middleware/authenticate'
import authRoutes from './routes/auth.routes'
import apiKeysRoutes from './routes/apikeys.routes'
import hostsRoutes from './routes/hosts.routes'
import problemsRoutes from './routes/problems.routes'
import alertRulesRoutes from './routes/alertrules.routes'
import hostGroupsRoutes from './routes/hostgroups.routes'
import latestDataRoutes from './routes/latestdata.routes'
import summaryRoutes from './routes/summary.routes'
import maintenanceRoutes from './routes/maintenance.routes'
import adminRoutes from './routes/admin.routes'
import reportsRoutes from './routes/reports.routes'
import { db } from './db'

const PORT = Number(process.env.AUTH_API_PORT || process.env.PORT || 4002)
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production'
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || 'http://localhost:3000'

const app = Fastify({ logger: true })
app.register(cors, { origin: DASHBOARD_ORIGIN === '*' ? true : DASHBOARD_ORIGIN, credentials: true })
app.register(cookie, { secret: process.env.COOKIE_SECRET || JWT_SECRET })
app.register(jwt, { secret: JWT_SECRET })
app.decorate('authenticate', authenticate)
app.get('/health', async () => ({ ok: true, service: 'auth-api', time: new Date().toISOString() }))
app.register(authRoutes)
app.register(apiKeysRoutes)
app.register(summaryRoutes)
app.register(hostsRoutes)
app.register(problemsRoutes)
app.register(alertRulesRoutes)
app.register(hostGroupsRoutes)
app.register(latestDataRoutes)
app.register(maintenanceRoutes)
app.register(adminRoutes)
app.register(reportsRoutes)

async function start(){try{await db.query('SELECT 1');await app.listen({port:PORT,host:'0.0.0.0'})}catch(e){app.log.error(e);process.exit(1)}}
process.on('SIGTERM',async()=>{await db.end().catch(()=>undefined);await app.close().catch(()=>undefined);process.exit(0)})
start()
