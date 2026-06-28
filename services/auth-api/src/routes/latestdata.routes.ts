// FILE: services/auth-api/src/routes/latestdata.routes.ts
import { FastifyInstance,FastifyRequest } from 'fastify'
import { db } from '../db'
function tenant(req:FastifyRequest){return (req as any).user.tenant_id}
export default async function latestDataRoutes(fastify:FastifyInstance){fastify.addHook('preHandler',(fastify as any).authenticate)
 fastify.get('/latest-data',async(req,reply)=>{try{const q:any=req.query||{};const p:any[]=[tenant(req)];let w='h.tenant_id=$1';if(q.host_id){p.push(q.host_id);w+=` AND h.id=$${p.length}`}if(q.group_id){p.push(q.group_id);w+=` AND h.host_group_id=$${p.length}`}if(q.metric){p.push(q.metric);w+=` AND mv.metric_name=$${p.length}`}const r=await db.query(`SELECT DISTINCT ON (mv.host_id,mv.metric_name) mv.host_id,h.hostname,h.display_name,h.status,mv.metric_name,mv.value,mv.unit,mv.collected_at,prev.value previous_value FROM metric_values mv JOIN hosts h ON h.id=mv.host_id LEFT JOIN LATERAL (SELECT value FROM metric_values p WHERE p.host_id=mv.host_id AND p.metric_name=mv.metric_name AND p.collected_at<mv.collected_at ORDER BY p.collected_at DESC LIMIT 1) prev ON true WHERE ${w} ORDER BY mv.host_id,mv.metric_name,mv.collected_at DESC`,p);return{data:r.rows}}catch(e){req.log.error(e);return reply.code(500).send({error:'Failed to get latest data'})}})
}
