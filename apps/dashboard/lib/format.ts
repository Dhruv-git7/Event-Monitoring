// FILE: apps/dashboard/lib/format.ts
export function formatBytes(bytes:number){if(!Number.isFinite(bytes))return '-';const u=['B','KB','MB','GB','TB'];let n=bytes,i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`}
export function formatUptime(secs:number){if(!secs)return '-';const d=Math.floor(secs/86400),h=Math.floor((secs%86400)/3600),m=Math.floor((secs%3600)/60);return d?`${d}d ${h}h ${m}m`:`${h}h ${m}m`}
export function formatDuration(ms:number){if(!ms)return '0m';const m=Math.floor(ms/60000),h=Math.floor(m/60),d=Math.floor(h/24);return d?`${d}d ${h%24}h`:h?`${h}h ${m%60}m`:`${m}m`}
export function timeAgo(iso?:string){if(!iso)return 'never';const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);if(s<60)return `${s}s ago`;const m=Math.floor(s/60);if(m<60)return `${m} minutes ago`;const h=Math.floor(m/60);if(h<24)return `${h} hours ago`;return `${Math.floor(h/24)} days ago`}
export function formatPercent(v:number){return Number.isFinite(v)?`${v.toFixed(1)}%`:'-'}
export function formatMetric(name:string,value:number){const unit=name.includes('usage')?'%':name.includes('mbps')?' Mbps':name.includes('mb')?' MB':name.includes('gb')?' GB':'';return `${name.replace(/_/g,' ')}: ${Number(value).toFixed(1)}${unit}`}
