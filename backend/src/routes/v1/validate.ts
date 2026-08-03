import { Hono } from 'hono'
import { z } from 'zod'
import { validateResume } from '../../services/validator.js'
import { optionalAuth } from '../../auth/middleware.js'

const validate = new Hono()

const dataSchema = z.object({
  sections: z.array(z.object({ id: z.string(), type: z.string(), title: z.string(), items: z.array(z.string()) })).default([]),
  contact: z.record(z.string(), z.string()).default({}),
  summary: z.string().default(''),
  skills: z.array(z.string()).default([]),
})

validate.post('/', optionalAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = dataSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid resume data', details: parsed.error.flatten().fieldErrors }, 400)
  return c.json(validateResume(parsed.data))
})

export default validate
