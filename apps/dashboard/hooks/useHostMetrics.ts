// FILE: apps/dashboard/hooks/useHostMetrics.ts
'use client'
import { useEffect,useMemo,useState } from 'react'
import { io, Socket } from 'socket.io-client'
let socket:Socket|null=null
function getSocket(){if(!socket)socket=io(process.env.NEXT_PUBLIC_WS_URL||'http://localhost:4001',{withCredentials:true,transports:['websocket','polling']});return socket}
export default function useHostMetrics(){const[metrics,setMetrics]=useState<Record<string,any>>({});const[problems,setProblems]=useState<any[]>([]);const[connected,setConnected]=useState(false);const s=useMemo(getSocket,[]);useEffect(()=>{const c=()=>{setConnected(true);s.emit('subscribe_all')};const d=()=>setConnected(false);const m=(e:any)=>setMetrics(x=>({...x,[e.hostId]:e.metrics}));const po=(e:any)=>setProblems(p=>[e.problem,...p]);const pr=(e:any)=>setProblems(p=>p.filter(x=>x.id!==e.problemId));s.on('connect',c);s.on('disconnect',d);s.on('metric_update',m);s.on('problem_opened',po);s.on('problem_resolved',pr);if(s.connected)c();return()=>{s.off('connect',c);s.off('disconnect',d);s.off('metric_update',m);s.off('problem_opened',po);s.off('problem_resolved',pr)}},[s]);return{metrics,latestByHost:metrics,problems,connected}}
