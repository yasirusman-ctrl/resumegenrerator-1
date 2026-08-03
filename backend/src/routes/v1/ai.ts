import { Hono } from 'hono'
import { z } from 'zod'
import { suggestBullets, rewriteBullet, generateSummary, suggestSkills, TONES } from '../../services/aiAssistant.js'
import { requireAuth } from '../../auth/middleware.js'

const ai = new Hono()

const bulletsSchema = z.object({
  role: z.string().min(1),
  existing: z.array(z.string()).optional(),
  provider: z.enum(['local', 'remote']).optional(),
})

const rewriteSchema = z.object({
  text: z.string().min(1),
  tone: z.enum(TONES),
  provider: z.enum(['local', 'remote']).optional(),
})

const summarySchema = z.object({
  role: z.string().min(1),
  skills: z.array(z.string()).optional(),
  provider: z.enum(['local', 'remote']).optional(),
})

const skillsSchema = z.object({
  role: z.string().min(1),
  provider: z.enum(['local', 'remote']).optional(),
})

ai.post('/suggest-bullets', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = bulletsSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed' }, 400)
  return c.json(await suggestBullets(parsed.data.role, parsed.data.existing || [], { provider: parsed.data.provider }))
})

ai.post('/rewrite', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = rewriteSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed' }, 400)
  return c.json(await rewriteBullet(parsed.data.text, parsed.data.tone, { provider: parsed.data.provider }))
})

ai.post('/summary', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = summarySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed' }, 400)
  return c.json(await generateSummary(parsed.data.role, parsed.data.skills || [], { provider: parsed.data.provider }))
})

ai.post('/skills', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = skillsSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed' }, 400)
  return c.json(await suggestSkills(parsed.data.role, { provider: parsed.data.provider }))
})

export default ai
