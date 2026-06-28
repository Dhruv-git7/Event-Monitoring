// FILE: services/auth-api/src/routes/maintenance.routes.ts
import { FastifyInstance,FastifyRequest } from 'fastify'
import { v4 as uuid } from 'uuid'
import { db } from '../db'
function tenant(req:FastifyRequest){return (req as any).user.tenant_id}
export default async function maintenanceRoutes(fastify:FastifyInstance){fastify.addHook('preHandler',(fastify as any).authenticate)
 fastify.get('/maintenance',async(req,reply)=>{try{const r=await db.query(`SELECT mw.*,COALESCE(json_agg(json_build_object('id',h.id,'hostname',h.hostname)) FILTER (WHERE h.id IS NOT NULL),'[]') hosts FROM maintenance_windows mw LEFT JOIN maintenance_window_hosts mwh ON mwh.maintenance_id=mw.id LEFT JOIN hosts h ON h.id=mwh.host_id WHERE mw.tenant_id=$1 GROUP BY mw.id ORDER BY mw.start_at DESC`,[tenant(req)]);return{windows:r.rows}}catch(e){req.log.error(e);return reply.code(500).send({error:'Failed to list maintenance windows'})}})
 fastify.post('/maintenance',async(req,reply)=>{try{const b:any=req.body||{};if(!b.name||!b.start_at||!b.end_at)return reply.code(400).send({error:'name,start_at,end_at are required'});const id=uuid();const r=await db.query('INSERT INTO maintenance_windows(id,tenant_id,name,description,start_at,end_at,all_hosts,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *',[id,tenant(req),b.name,b.description||null,b.start_at,b.end_at,!!b.all_hosts]);for(const hostId of b.host_ids||[]) await db.query('INSERT INTO maintenance_window_hosts(maintenance_id,host_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,hostId]);return reply.code(201).send({window:r.rows[0]})}catch(e){req.log.error(e);return reply.code(500).send({error:'Failed to create maintenance window'})}})
 fastify.delete('/maintenance/:id',async(req,reply)=>{try{await db.query('DELETE FROM maintenance_windows WHERE id=$1 AND tenant_id=$2',[(req.params as any).id,tenant(req)]);return{ok:true}}catch(e){req.log.error(e);return reply.code(500).send({error:'Failed to delete maintenance window'})}})
}
