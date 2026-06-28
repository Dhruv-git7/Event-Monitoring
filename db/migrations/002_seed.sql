-- FILE: db/migrations/002_seed.sql
INSERT INTO tenants (id,name,slug,created_at) VALUES ('00000000-0000-0000-0000-000000000001','Default Enterprise Tenant','default',NOW()) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id,tenant_id,name,email,password_hash,role,status,created_at)
VALUES ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Platform Admin','admin@platform.local','$2a$12$lVg6v5u2NGV8rWq7f9eD..U6uTuSPxYIhvhH52W/yZG8tmk7uZHgy','admin','active',NOW())
ON CONFLICT (email) DO NOTHING;

INSERT INTO host_groups (id,tenant_id,name,description,created_at) VALUES
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','Linux Servers','Production Linux servers',NOW()),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','Database Servers','Database infrastructure',NOW()),
('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001','Network Devices','Routers, switches and firewalls',NOW())
ON CONFLICT (tenant_id,name) DO NOTHING;

INSERT INTO hosts (id,tenant_id,host_group_id,hostname,display_name,ip_address,os_type,os_version,agent_key,agent_version,status,last_seen,registered_at,tags,metadata) VALUES
('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','prod-web-01','Production Web 01','10.10.1.11','linux','Ubuntu 22.04','ak_demo_web_0000000000000001','1.0.0','online',NOW(),NOW(),ARRAY['prod','web'],'{}'),
('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102','prod-db-01','Production DB 01','10.10.1.21','linux','Debian 12','ak_demo_db_0000000000000002','1.0.0','warning',NOW()-INTERVAL '1 minute',NOW(),ARRAY['prod','db'],'{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO alert_rules (id,tenant_id,host_id,host_group_id,name,metric_name,condition,warn_value,crit_value,duration_secs,is_enabled,notify_channels,created_at) VALUES
('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000001',NULL,NULL,'High CPU Usage','cpu_usage','>',75,90,60,TRUE,'[]',NOW()),
('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000001',NULL,NULL,'High RAM Usage','ram_usage','>',75,90,60,TRUE,'[]',NOW()),
('00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000001',NULL,NULL,'High Disk Usage','disk_usage','>',80,95,120,TRUE,'[]',NOW()),
('00000000-0000-0000-0000-000000000304','00000000-0000-0000-0000-000000000001',NULL,NULL,'High Load Average','load_avg_1m','>',4,8,60,TRUE,'[]',NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO metric_values (id,host_id,metric_name,value,unit,collected_at,received_at)
SELECT gen_random_uuid(),'00000000-0000-0000-0000-000000000201','cpu_usage',(30+random()*35)::float,'%',NOW()-(n||' minutes')::interval,NOW()-(n||' minutes')::interval FROM generate_series(1,180) n;
INSERT INTO metric_values (id,host_id,metric_name,value,unit,collected_at,received_at)
SELECT gen_random_uuid(),'00000000-0000-0000-0000-000000000201','ram_usage',(45+random()*25)::float,'%',NOW()-(n||' minutes')::interval,NOW()-(n||' minutes')::interval FROM generate_series(1,180) n;
INSERT INTO metric_values (id,host_id,metric_name,value,unit,collected_at,received_at)
SELECT gen_random_uuid(),'00000000-0000-0000-0000-000000000202','cpu_usage',(55+random()*35)::float,'%',NOW()-(n||' minutes')::interval,NOW()-(n||' minutes')::interval FROM generate_series(1,180) n;

INSERT INTO problems (id,tenant_id,host_id,alert_rule_id,metric_name,severity,status,title,description,trigger_value,triggered_at)
VALUES ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000302','ram_usage','warning','active','WARNING: High RAM Usage','RAM usage exceeded warning threshold',82.4,NOW()-INTERVAL '35 minutes')
ON CONFLICT (id) DO NOTHING;
