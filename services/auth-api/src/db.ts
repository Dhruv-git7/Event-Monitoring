// FILE: services/auth-api/src/db.ts
import { Pool } from 'pg'
import { createClient } from '@clickhouse/client'

export const db = new Pool({
  connectionString: process.env.PG_URL || 'postgresql://platform:platform@localhost:5432/platform',
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000
})

export const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DATABASE || 'platform'
})
