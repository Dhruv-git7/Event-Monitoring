// FILE: services/metrics-processor/src/alert-evaluator.ts
import { Pool } from 'pg'
import { v4 as uuid } from 'uuid'
import { insertAlertEvent } from './clickhouse'
import { AlertEvaluationResult, AlertRule, Problem } from './types'

function compare(condition: string, value: number, threshold: number): boolean {
  switch ((condition || '>').trim()) {
    case '>': return value > threshold
    case '>=': return value >= threshold
    case '<': return value < threshold
    case '<=': return value <= threshold
    case '=':
    case '==': return value === threshold
    case '!=': return value !== threshold
    default: return value > threshold
  }
}

function title(rule: AlertRule, severity: string, value: number): string {
  return `${severity.toUpperCase()}: ${rule.name} (${rule.metric_name} ${rule.condition} ${severity === 'critical' ? rule.crit_value : rule.warn_value}, current ${Number(value).toFixed(2)})`
}

function description(rule: AlertRule, severity: string, value: number): string {
  const threshold = severity === 'critical' ? rule.crit_value : rule.warn_value
  return `Alert rule "${rule.name}" fired because metric "${rule.metric_name}" value ${value} matched condition ${rule.condition} ${threshold}.`
}

async function isSuppressedByMaintenance(db: Pool, tenantId: string, hostId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1
     FROM maintenance_windows mw
     LEFT JOIN maintenance_window_hosts mwh ON mwh.maintenance_id = mw.id
     WHERE mw.tenant_id=$1
       AND mw.start_at <= NOW()
       AND mw.end_at >= NOW()
       AND (mw.all_hosts = true OR mwh.host_id = $2)
     LIMIT 1`,
    [tenantId, hostId]
  )
  return !!result.rows[0]
}

async function loadRules(db: Pool, tenantId: string, hostId: string): Promise<AlertRule[]> {
  const result = await db.query(
    `SELECT ar.*
     FROM alert_rules ar
     JOIN hosts h ON h.id = $2
     WHERE ar.tenant_id = $1
       AND ar.is_enabled = true
       AND (ar.host_id IS NULL OR ar.host_id = $2)
       AND (ar.host_group_id IS NULL OR ar.host_group_id = h.host_group_id)
     ORDER BY ar.name ASC`,
    [tenantId, hostId]
  )
  return result.rows
}

async function activeProblem(db: Pool, hostId: string, ruleId: string, metricName: string): Promise<Problem | null> {
  const result = await db.query(
    `SELECT * FROM problems
     WHERE host_id=$1 AND alert_rule_id=$2 AND metric_name=$3 AND status IN ('active','acknowledged')
     ORDER BY triggered_at DESC
     LIMIT 1`,
    [hostId, ruleId, metricName]
  )
  return result.rows[0] || null
}

export async function evaluateAlerts(db: Pool, tenantId: string, hostId: string, hostname: string, metrics: Record<string, number>): Promise<AlertEvaluationResult> {
  const opened: Problem[] = []
  const resolved: string[] = []
  const rules = await loadRules(db, tenantId, hostId)
  const suppressed = await isSuppressedByMaintenance(db, tenantId, hostId)

  for (const rule of rules) {
    const value = metrics[rule.metric_name]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue

    let severity: 'critical' | 'warning' | null = null
    if (rule.crit_value !== null && rule.crit_value !== undefined && compare(rule.condition, value, Number(rule.crit_value))) severity = 'critical'
    else if (rule.warn_value !== null && rule.warn_value !== undefined && compare(rule.condition, value, Number(rule.warn_value))) severity = 'warning'

    const current = await activeProblem(db, hostId, rule.id, rule.metric_name)
    if (severity && !suppressed) {
      if (!current) {
        const id = uuid()
        const inserted = await db.query(
          `INSERT INTO problems (id, tenant_id, host_id, alert_rule_id, metric_name, severity, status, title, description, trigger_value, triggered_at)
           VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,NOW())
           RETURNING *`,
          [id, tenantId, hostId, rule.id, rule.metric_name, severity, title(rule, severity, value), description(rule, severity, value), value]
        )
        const p = { ...inserted.rows[0], hostname }
        opened.push(p)
        await insertAlertEvent({ tenant_id: tenantId, host_id: hostId, problem_id: id, alert_rule_id: rule.id, metric_name: rule.metric_name, severity, status: 'opened', value })
      } else if (current.severity !== severity || Number(current.trigger_value) !== value) {
        const updated = await db.query(
          `UPDATE problems SET severity=$2, title=$3, description=$4, trigger_value=$5 WHERE id=$1 RETURNING *`,
          [current.id, severity, title(rule, severity, value), description(rule, severity, value), value]
        )
        opened.push({ ...updated.rows[0], hostname })
      }
    } else if (current) {
      await db.query(`UPDATE problems SET status='resolved', resolved_at=NOW() WHERE id=$1`, [current.id])
      resolved.push(current.id)
      await insertAlertEvent({ tenant_id: tenantId, host_id: hostId, problem_id: current.id, alert_rule_id: rule.id, metric_name: rule.metric_name, severity: current.severity, status: 'resolved', value })
    }
  }

  return { opened, resolved }
}
