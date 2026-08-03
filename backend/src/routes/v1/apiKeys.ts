import { Hono } from 'hono'
import { z } from 'zod'
import { createApiKey, listApiKeys, revokeApiKey } from '../../db/apiKeys.js'
import { requireAuth } from '../../auth/middleware.js'

const apiKeys = new Hono()

apiKeys.get('/', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  return c.json({ keys: listApiKeys(user.id) })
})

apiKeys.post('/', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    name: z.string().min(1).max(80),
    scopes: z.array(z.string()).default(['resume:read', 'resume:write']),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed' }, 400)
  const { row, secret } = createApiKey(user.id, parsed.data.name, parsed.data.scopes)
  return c.json({ key: { id: row.id, name: row.name, prefix: row.prefix, scopes: JSON.parse(row.scopes), created_at: row.created_at }, secret }, 201)
})

apiKeys.delete('/:id', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  revokeApiKey(user.id, Number(c.req.param('id')))
  return c.json({ ok: true })
})

export default apiKeys
