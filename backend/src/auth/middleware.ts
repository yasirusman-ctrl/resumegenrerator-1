import type { Context, Next } from 'hono'
import { verifyToken, type TokenPayload } from './tokens.js'
import { findApiKey } from '../db/apiKeys.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('auth')

export interface AuthVars {
  user: { id: number; email: string; role: string }
  apiKey?: { id: number; userId: number; scopes: string[] }
}

function extractBearer(c: Context): string | null {
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export async function requireAuth(c: Context, next: Next) {
  const token = extractBearer(c) || c.req.query('token') || null
  if (token) {
    const payload = verifyToken(token)
    if (payload) {
      ;(c as any).set('user', { id: payload.sub, email: payload.email, role: payload.role })
      return next()
    }
  }

  const apiKey = c.req.header('X-API-Key') || c.req.header('x-api-key')
  if (apiKey) {
    const key = findApiKey(apiKey)
    if (key) {
      ;(c as any).set('user', { id: key.user_id, email: '', role: 'user' })
      ;(c as any).set('apiKey', { id: key.id, userId: key.user_id, scopes: JSON.parse(key.scopes) })
      return next()
    }
  }

  return c.json({ error: 'Authentication required' }, 401)
}

export async function optionalAuth(c: Context, next: Next) {
  const token = extractBearer(c)
  if (token) {
    const payload = verifyToken(token)
    if (payload) {
      ;(c as any).set('user', { id: payload.sub, email: payload.email, role: payload.role })
    }
  }
  return next()
}

export function requireRole(role: string) {
  return async (c: Context, next: Next) => {
    const user = (c as any).get('user') as AuthVars['user'] | undefined
    if (!user) return c.json({ error: 'Authentication required' }, 401)
    if (user.role !== 'admin' && user.role !== role) {
      return c.json({ error: 'Insufficient permissions' }, 403)
    }
    return next()
  }
}

export function getAuthUser(c: Context): AuthVars['user'] | undefined {
  const user = (c as any).get('user') as AuthVars['user'] | undefined
  if (user) return user
  const token = extractBearer(c)
  if (token) {
    const payload = verifyToken(token)
    if (payload) log.debug('token user resolved')
  }
  return undefined
}
