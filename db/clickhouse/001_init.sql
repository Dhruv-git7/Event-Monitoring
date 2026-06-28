-- FILE: db/clickhouse/001_init.sql
CREATE DATABASE IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.metrics (
  tenant_id String,
  host_id String,
  hostname String,
  metric_name LowCardinality(String),
  value Float64,
  unit LowCardinality(String),
  collected_at DateTime,
  received_at DateTime
) ENGINE = MergeTree
PARTITION BY toYYYYMM(collected_at)
ORDER BY (host_id, metric_name, collected_at)
TTL collected_at + INTERVAL 365 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS platform.metrics_hourly
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (host_id, metric_name, bucket)
AS SELECT tenant_id, host_id, hostname, metric_name, unit, toStartOfHour(collected_at) AS bucket,
  avgState(value) AS avg_state, minState(value) AS min_state, maxState(value) AS max_state, countState() AS count_state,
  avg(value) AS avg_value, min(value) AS min_value, max(value) AS max_value, count() AS samples
FROM platform.metrics GROUP BY tenant_id, host_id, hostname, metric_name, unit, bucket;

CREATE MATERIALIZED VIEW IF NOT EXISTS platform.metrics_daily
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (host_id, metric_name, bucket)
AS SELECT tenant_id, host_id, hostname, metric_name, unit, toStartOfDay(collected_at) AS bucket,
  avgState(value) AS avg_state, minState(value) AS min_state, maxState(value) AS max_state, countState() AS count_state,
  avg(value) AS avg_value, min(value) AS min_value, max(value) AS max_value, count() AS samples
FROM platform.metrics GROUP BY tenant_id, host_id, hostname, metric_name, unit, bucket;

CREATE TABLE IF NOT EXISTS platform.alert_events (
  tenant_id String,
  host_id String,
  problem_id String,
  alert_rule_id String,
  metric_name LowCardinality(String),
  severity LowCardinality(String),
  status LowCardinality(String),
  value Float64,
  event_time DateTime
) ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (host_id, event_time, problem_id);
