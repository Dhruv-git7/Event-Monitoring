// FILE: services/auth-api/src/types.ts
import { FastifyRequest } from 'fastify'

export interface User {
  id: string
  tenant_id: string
  name: string
  email: string
  role: 'admin' | 'operator' | 'viewer'
  status: 'active' | 'disabled'
}

export interface JwtPayload {
  id: string
  user_id: string
  tenant_id: string
  email: string
  role: string
  name: string
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: JwtPayload
}

export interface LoginBody {
  email: string
  password: string
}

export interface RegisterBody {
  name?: string
  email: string
  password: string
}

export interface ApiKeyPayload {
  id: string
  tenant_id: string
  name: string
  user_id: string
}
