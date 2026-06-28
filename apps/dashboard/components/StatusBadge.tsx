// FILE: apps/dashboard/components/StatusBadge.tsx
import { badgeStyle } from '../lib/theme'
export default function StatusBadge({status,size='sm'}:{status:string,size?:'sm'|'md'}){return <span style={{...badgeStyle(status),borderRadius:3,padding:size==='sm'?'2px 6px':'3px 8px',fontSize:size==='sm'?12:13,textTransform:'capitalize',display:'inline-block',lineHeight:'16px'}}>{status||'unknown'}</span>}
