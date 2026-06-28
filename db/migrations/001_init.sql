-- FILE: db/migrations/001_init.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('admin','operator','viewer')),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  key_prefix VARCHAR(16) NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_api_keys_tenant_user ON api_keys(tenant_id,user_id);

CREATE TABLE host_groups (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,name)
);

CREATE TABLE hosts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host_group_id UUID REFERENCES host_groups(id) ON DELETE SET NULL,
  hostname VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  ip_address INET,
  os_type VARCHAR(64),
  os_version VARCHAR(160),
  agent_key TEXT NOT NULL UNIQUE,
  agent_version VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'unknown' CHECK (status IN ('online','offline','warning','critical','unknown')),
  last_seen TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  UNIQUE(tenant_id,hostname)
);
CREATE INDEX idx_hosts_tenant_status ON hosts(tenant_id,status);
CREATE INDEX idx_hosts_group ON hosts(host_group_id);
CREATE INDEX idx_hosts_last_seen ON hosts(last_seen DESC);

CREATE TABLE heartbeats (
  id UUID PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  agent_version VARCHAR(64),
  ip_address INET,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_heartbeats_host_received ON heartbeats(host_id,received_at DESC);

CREATE TABLE metric_definitions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  unit VARCHAR(32) NOT NULL DEFAULT '',
  category VARCHAR(64) NOT NULL DEFAULT 'system',
  warn_threshold DOUBLE PRECISION,
  crit_threshold DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(host_id,name)
);
CREATE INDEX idx_metric_definitions_tenant ON metric_definitions(tenant_id);

CREATE TABLE metric_values (
  id UUID NOT NULL,
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  metric_name VARCHAR(160) NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit VARCHAR(32) NOT NULL DEFAULT '',
  collected_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(id,collected_at)
) PARTITION BY RANGE (collected_at);

CREATE TABLE metric_values_2026_01 PARTITION OF metric_values FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE metric_values_2026_02 PARTITION OF metric_values FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE metric_values_2026_03 PARTITION OF metric_values FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE metric_values_2026_04 PARTITION OF metric_values FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE metric_values_2026_05 PARTITION OF metric_values FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE metric_values_2026_06 PARTITION OF metric_values FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE metric_values_2026_07 PARTITION OF metric_values FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE metric_values_2026_08 PARTITION OF metric_values FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE metric_values_2026_09 PARTITION OF metric_values FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE metric_values_2026_10 PARTITION OF metric_values FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE metric_values_2026_11 PARTITION OF metric_values FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE metric_values_2026_12 PARTITION OF metric_values FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE metric_values_default PARTITION OF metric_values DEFAULT;
CREATE INDEX idx_metric_values_host_metric_time ON metric_values(host_id,metric_name,collected_at DESC);
CREATE INDEX idx_metric_values_time ON metric_values(collected_at DESC);

CREATE TABLE alert_rules (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host_id UUID REFERENCES hosts(id) ON DELETE CASCADE,
  host_group_id UUID REFERENCES host_groups(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  metric_name VARCHAR(160) NOT NULL,
  condition VARCHAR(8) NOT NULL DEFAULT '>' CHECK (condition IN ('>','>=','<','<=','=','==','!=')),
  warn_value DOUBLE PRECISION,
  crit_value DOUBLE PRECISION,
  duration_secs INTEGER NOT NULL DEFAULT 60 CHECK (duration_secs >= 0),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notify_channels JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (host_id IS NULL OR host_group_id IS NULL)
);
CREATE INDEX idx_alert_rules_tenant_metric ON alert_rules(tenant_id,metric_name);
CREATE INDEX idx_alert_rules_host ON alert_rules(host_id);

CREATE TABLE problems (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  alert_rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  metric_name VARCHAR(160) NOT NULL,
  severity VARCHAR(32) NOT NULL CHECK (severity IN ('warning','critical')),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active','acknowledged','resolved')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_value DOUBLE PRECISION,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_problems_tenant_status ON problems(tenant_id,status,triggered_at DESC);
CREATE INDEX idx_problems_host_status ON problems(host_id,status);
CREATE UNIQUE INDEX idx_problems_open_rule ON problems(host_id,alert_rule_id,metric_name) WHERE status IN ('active','acknowledged');

CREATE TABLE host_services (
  id UUID PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  port INTEGER,
  status VARCHAR(32) NOT NULL CHECK (status IN ('running','stopped','unknown')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(host_id,name)
);

CREATE TABLE maintenance_windows (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_hosts BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);
CREATE TABLE maintenance_window_hosts (
  maintenance_id UUID NOT NULL REFERENCES maintenance_windows(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  PRIMARY KEY(maintenance_id,host_id)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  resource_type VARCHAR(80),
  resource_id UUID,
  ip_address INET,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_tenant_time ON audit_logs(tenant_id,created_at DESC);
