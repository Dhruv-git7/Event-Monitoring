// FILE: services/auth-api/src/routes/hostgroups.routes.ts
import { FastifyInstance,FastifyRequest } from 'fastify'
import { v4 as uuid } from 'uuid'
import { db } from '../db'
function tenant(req:FastifyRequest){return (req as any).user.tenant_id}
export default async function hostGroupsRoutes(fastify:FastifyInstance){fastify.addHook('preHandler',(fastify as any).authenticate)
 fastify.get('/host-groups',async(req,reply)=>{try{const r=await db.query(`SELECT hg.*,COALESCE(COUNT(h.id),0)::int host_count FROM host_groups hg LEFT JOIN hosts h ON h.host_group_id=hg.id WHERE hg.tenant_id=$1 GROUP BY hg.id ORDER BY hg.name`,[tenant(req)]);return{groups:r.rows}}catch(e){req.log.error(e);return reply.code(500).send({error:'Failed to list host groups'})}})
 fastify.post('/host-groups',async(req,reply)=>{try{const b:any=req.body||{};if(!b.name)return reply.code(400).send({error:'name is required'});const r=await db.query('INSERT INTO host_groups(id,tenant_id,name,description,created_at) VALUES($1,$2,$3,$4,NOW()) RETURNING *',[uuid(),tenant(req),b.name,b.description||null]);return reply.code(201).send({group:r.rows[0]})}catch(e){req.log.error(e);return reply.code(500).send({error:'Failed to create host group'})}})
 fastify.put('/host-groups/:id',async(req,reply)=>{try{const b:any=req.body||{};const r=await db.query('UPDATE host_groups SET name=$3,description=$4 WHERE id=$1 AND tenant_id=$2 RETURNING *',[(req.params as any).id,tenant(req),b.name,b.description||null]);if(!r.rows[0])return reply.code(404).send({error:'Group not found'});return{group:r.rows[0]}}catch(e){req.log.error(e);return reply.code(500).send({error:'Failed to update host group'})}})
 fastify.delete('/host-groups/:id',async(req,reply)=>{try{const count=await db.query('SELECT COUNT(*)::int c FROM hosts WHERE host_group_id=$1',[(req.params as any).id]);if(count.rows[0].c>0)return reply.code(409).send({error:'Cannot delete group with hosts'});await db.query('DELETE FROM host_groups WHERE id=$1 AND tenant_id=$2',[(req.params as any).id,tenant(req)]);return{ok:true}}catch(e){req.log.error(e);return reply.code(500).send({error:'Failed to delete host group'})}})
}
