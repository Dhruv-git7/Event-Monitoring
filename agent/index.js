// FILE: agent/index.js
const os = require('os')
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const net = require('net')
const { execSync } = require('child_process')

const VERSION = '1.0.0'
let stopped = false
let checkinBackoff = 1000
let heartbeatBackoff = 1000

function log(level, msg) { console.log(`${new Date().toISOString()} [${level}] ${msg}`) }
function loadConfig() { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')) } catch { return {} } }
function parseArgs(cfg) { const a = process.argv.slice(2); for (let i=0;i<a.length;i++){ if(a[i]==='--server') cfg.serverUrl=a[++i]; else if(a[i]==='--key') cfg.agentKey=a[++i]; else if(a[i]==='--hostname') cfg.hostname=a[++i]; else if(a[i]==='--interval') cfg.interval=Number(a[++i]) } return cfg }
const config = parseArgs(Object.assign({ serverUrl:'http://localhost:4000', agentKey:'', hostname:'', interval:30, heartbeatInterval:10, services:[] }, loadConfig()))
if (!config.agentKey) { log('ERROR','agentKey missing. Register host first and set config.json agentKey or pass --key.'); process.exit(1) }
config.hostname = config.hostname || os.hostname()

function postJson(url, body) { return new Promise((resolve, reject) => { const data = JSON.stringify(body); const u = new URL(url); const lib = u.protocol === 'https:' ? https : http; const req = lib.request({ hostname:u.hostname, port:u.port || (u.protocol==='https:'?443:80), path:u.pathname+u.search, method:'POST', timeout:10000, headers:{ 'content-type':'application/json', 'content-length':Buffer.byteLength(data) } }, res => { let raw=''; res.on('data', c=>raw+=c); res.on('end',()=>{ if(res.statusCode>=200&&res.statusCode<300) resolve(raw?JSON.parse(raw):{}); else reject(new Error(`HTTP ${res.statusCode}: ${raw}`)) }) }); req.on('error', reject); req.on('timeout',()=>req.destroy(new Error('timeout'))); req.write(data); req.end() }) }
function ipAddress(){ const nets=os.networkInterfaces(); for(const n of Object.keys(nets)){ for(const x of nets[n]||[]){ if(x.family==='IPv4'&&!x.internal) return x.address } } return '127.0.0.1' }
function cpuSnapshot(){ let idle=0,total=0; for(const c of os.cpus()){ idle+=c.times.idle; total+=c.times.user+c.times.nice+c.times.sys+c.times.idle+c.times.irq } return {idle,total} }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }
async function cpuUsage(){ const a=cpuSnapshot(); await sleep(950); const b=cpuSnapshot(); const idle=b.idle-a.idle,total=b.total-a.total; return total>0?Math.max(0,Math.min(100,100-(idle/total*100))):0 }
function diskUsage(){ try{ if(process.platform==='win32'){ const out=execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /value',{encoding:'utf8'}); const free=Number((out.match(/FreeSpace=(\d+)/)||[])[1]||0); const size=Number((out.match(/Size=(\d+)/)||[])[1]||0); return { disk_total_gb:size/1073741824, disk_used_gb:(size-free)/1073741824 } } const out=execSync('df -k /',{encoding:'utf8'}).trim().split(/\r?\n/)[1].trim().split(/\s+/); return { disk_total_gb:Number(out[1])/1048576, disk_used_gb:Number(out[2])/1048576 } }catch{ return { disk_total_gb:0, disk_used_gb:0 } } }
function netCounters(){ let rx=0,tx=0; try{ if(process.platform==='linux'){ const lines=fs.readFileSync('/proc/net/dev','utf8').split('\n').slice(2); for(const l of lines){ const p=l.trim().split(/[:\s]+/); if(p[0]&&p[0]!=='lo'){ rx+=Number(p[1]||0); tx+=Number(p[9]||0) } } } else if(process.platform==='win32'){ const out=execSync('netstat -e',{encoding:'utf8'}); const line=out.split(/\r?\n/).find(x=>/^\s*Bytes\s+/i.test(x)); if(line){ const p=line.trim().split(/\s+/); rx=Number(p[1]||0); tx=Number(p[2]||0) } } }catch{} return {rx,tx,at:Date.now()} }
async function networkDelta(){ const a=netCounters(); await sleep(950); const b=netCounters(); return { net_in_bytes:Math.max(0,b.rx-a.rx), net_out_bytes:Math.max(0,b.tx-a.tx) } }
function checkPort(port){ return new Promise(resolve=>{ const s=new net.Socket(); let done=false; const finish=v=>{ if(!done){ done=true; s.destroy(); resolve(v) } }; s.setTimeout(2000); s.once('connect',()=>finish(true)); s.once('timeout',()=>finish(false)); s.once('error',()=>finish(false)); s.connect(port,'127.0.0.1') }) }
async function services(){ const arr=config.services&&config.services.length?config.services:[]; const out=[]; for(const svc of arr){ out.push({ name:svc.name||`port-${svc.port}`, port:svc.port, running:await checkPort(Number(svc.port)) }) } return out }
async function collect(){ const [cpu,netd] = await Promise.all([cpuUsage(), networkDelta()]); const total=os.totalmem()/1048576, free=os.freemem()/1048576, load=os.loadavg(), disk=diskUsage(); return Object.assign({ cpu_usage:cpu, ram_total_mb:Math.round(total), ram_used_mb:Math.round(total-free), load_avg_1m:load[0]||0, load_avg_5m:load[1]||0, load_avg_15m:load[2]||0, uptime_secs:Math.floor(os.uptime()), processes:0 }, disk, netd) }
async function heartbeat(){ try{ await postJson(`${config.serverUrl.replace(/\/$/,'')}/agent/heartbeat`,{ agent_key:config.agentKey, hostname:config.hostname, ip:ipAddress(), agent_version:VERSION }); heartbeatBackoff=1000; log('INFO','heartbeat sent') }catch(e){ log('WARN',`heartbeat failed: ${e.message}`); heartbeatBackoff=Math.min(60000,heartbeatBackoff*2) } }
async function checkin(){ try{ const metrics=await collect(); const svc=await services(); await postJson(`${config.serverUrl.replace(/\/$/,'')}/agent/checkin`,{ agent_key:config.agentKey, hostname:config.hostname, ip_address:ipAddress(), agent_version:VERSION, collected_at:new Date().toISOString(), metrics, services:svc }); checkinBackoff=1000; log('INFO',`checkin sent cpu=${metrics.cpu_usage.toFixed(1)} ram=${((metrics.ram_used_mb/metrics.ram_total_mb)*100).toFixed(1)}%`) }catch(e){ log('WARN',`checkin failed: ${e.message}`); checkinBackoff=Math.min(60000,checkinBackoff*2) } }
async function loop(fn, sec, backoffName){ while(!stopped){ await fn(); const delay = backoffName==='heartbeat'?Math.max(sec*1000,heartbeatBackoff):Math.max(sec*1000,checkinBackoff); await sleep(delay) } }
process.on('SIGTERM',()=>{ stopped=true; log('INFO','stopping agent') })
process.on('SIGINT',()=>{ stopped=true; log('INFO','stopping agent') })
log('INFO',`agent ${VERSION} started for ${config.hostname} -> ${config.serverUrl}`)
loop(heartbeat, Number(config.heartbeatInterval||10), 'heartbeat')
loop(checkin, Number(config.interval||30), 'checkin')
