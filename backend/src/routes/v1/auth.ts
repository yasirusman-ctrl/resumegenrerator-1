import { Hono } from 'hono'
import { z } from 'zod'
import { hashPassword, verifyPassword } from '../../auth/password.js'
import { signToken } from '../../auth/tokens.js'
import { createUser, findUserByEmail, findUserByUsername, getUserById, updateUser, getUserSettings, saveUserSettings, publicUser } from '../../db/users.js'
import { requireAuth } from '../../auth/middleware.js'

const auth = new Hono()

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid username'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().max(80).optional(),
})

auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400)

  const { email, username, password, name } = parsed.data
  if (findUserByEmail(email)) return c.json({ error: 'Email already registered' }, 409)
  if (findUserByUsername(username)) return c.json({ error: 'Username already taken' }, 409)

  const user = createUser({ email, username, name, passwordHash: await hashPassword(password) })
  const token = signToken({ sub: user.id, email: user.email, role: user.role })
  return c.json({ token, user: publicUser(user) }, 201)
})

auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ email: z.string(), password: z.string() }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Email and password required' }, 400)

  const user = findUserByEmail(parsed.data.email)
  if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }
  const token = signToken({ sub: user.id, email: user.email, role: user.role })
  return c.json({ token, user: publicUser(user) })
})

auth.get('/me', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  const record = getUserById(user.id)
  if (!record) return c.json({ error: 'User not found' }, 404)
  return c.json({ user: publicUser(record), settings: getUserSettings(user.id) || null })
})

auth.patch('/me', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ name: z.string().max(80).optional(), bio: z.string().max(500).optional(), avatar: z.string().max(500).optional() }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed' }, 400)
  updateUser(user.id, parsed.data)
  return c.json({ ok: true })
})

auth.get('/settings', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  return c.json(getUserSettings(user.id) || {})
})

auth.patch('/settings', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    default_template: z.string().optional(),
    default_accent: z.string().optional(),
    default_font: z.string().optional(),
    locale: z.string().optional(),
    email_notifications: z.boolean().optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed' }, 400)
  saveUserSettings(user.id, parsed.data as Record<string, string | number | null>)
  return c.json({ ok: true })
})

export default auth
