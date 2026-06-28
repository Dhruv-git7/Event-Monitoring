// FILE: services/metrics-processor/src/db.ts
import { Pool } from 'pg'

export const db = new Pool({
  connectionString: process.env.PG_URL || 'postgresql://platform:platform@localhost:5432/platform',
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000
})

export async function closeDb() {
  await db.end()
}
