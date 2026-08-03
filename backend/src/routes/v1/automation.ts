import { Hono } from 'hono'
import { z } from 'zod'
import {
  createSchedule, listSchedulesByUser, getSchedule, updateSchedule, deleteSchedule,
  createWebhook, listWebhooksByUser, deleteWebhook,
} from '../../db/automation.js'
import { getDoc } from '../../db/docs.js'
import { parseCron, nextRunAfter, executeSchedule } from '../../services/scheduler.js'
import { deliverWebhook } from '../../services/webhooks.js'
import { requireAuth } from '../../auth/middleware.js'

const automation = new Hono()

const scheduleSchema = z.object({
  doc_id: z.number().int().nullable().optional(),
  cron: z.string().min(1),
  timezone: z.string().optional(),
  email_to: z.string().email().nullable().optional(),
  webhook_url: z.string().url().nullable().optional(),
})

automation.get('/schedules', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  return c.json({ schedules: listSchedulesByUser(user.id) })
})

automation.post('/schedules', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const parsed = scheduleSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400)
  try {
    parseCron(parsed.data.cron)
  } catch {
    return c.json({ error: 'Invalid cron expression' }, 400)
  }
  if (parsed.data.doc_id) {
    const doc = getDoc(parsed.data.doc_id)
    if (!doc || doc.user_id !== user.id) return c.json({ error: 'Resume not found or not yours' }, 404)
  }
  const schedule = createSchedule({ userId: user.id, docId: parsed.data.doc_id ?? null, cron: parsed.data.cron, timezone: parsed.data.timezone, emailTo: parsed.data.email_to ?? null, webhookUrl: parsed.data.webhook_url ?? null })
  const next = nextRunAfter(schedule.cron, new Date()).toISOString()
  updateSchedule(schedule.id, { next_run_at: next })
  return c.json({ schedule: { ...schedule, next_run_at: next } }, 201)
})

automation.get('/schedules/next', (c) => {
  const cron = c.req.query('cron')
  if (!cron) return c.json({ error: 'cron query required' }, 400)
  try {
    return c.json({ next: nextRunAfter(cron, new Date()).toISOString() })
  } catch {
    return c.json({ error: 'Invalid cron expression' }, 400)
  }
})

automation.patch('/schedules/:id', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const schedule = getSchedule(Number(c.req.param('id')))
  if (!schedule || schedule.user_id !== user.id) return c.json({ error: 'Schedule not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const parsed = scheduleSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed' }, 400)
  if (parsed.data.cron) {
    try {
      parseCron(parsed.data.cron)
    } catch {
      return c.json({ error: 'Invalid cron expression' }, 400)
    }
  }
  const patch: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.cron) patch.next_run_at = nextRunAfter(parsed.data.cron, new Date()).toISOString()
  updateSchedule(schedule.id, patch as never)
  return c.json({ ok: true })
})

automation.delete('/schedules/:id', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  const schedule = getSchedule(Number(c.req.param('id')))
  if (!schedule || schedule.user_id !== user.id) return c.json({ error: 'Schedule not found' }, 404)
  deleteSchedule(schedule.id)
  return c.json({ ok: true })
})

automation.post('/schedules/:id/run', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const schedule = getSchedule(Number(c.req.param('id')))
  if (!schedule || schedule.user_id !== user.id) return c.json({ error: 'Schedule not found' }, 404)
  await executeSchedule(schedule.id)
  return c.json({ ok: true })
})

const webhookSchema = z.object({
  name: z.string().min(1).max(80),
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.string()).default([]),
})

automation.get('/webhooks', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  return c.json({ webhooks: listWebhooksByUser(user.id).map(w => ({ ...w, events: JSON.parse(w.events) })) })
})

automation.post('/webhooks', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const parsed = webhookSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400)
  const webhook = createWebhook({ userId: user.id, ...parsed.data })
  return c.json({ webhook: { ...webhook, events: JSON.parse(webhook.events) } }, 201)
})

automation.delete('/webhooks/:id', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  const webhook = (listWebhooksByUser(user.id) || []).find(w => w.id === Number(c.req.param('id')))
  if (!webhook) return c.json({ error: 'Webhook not found' }, 404)
  deleteWebhook(webhook.id)
  return c.json({ ok: true })
})

automation.post('/webhooks/test', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ url: z.string().url(), secret: z.string().optional(), event: z.string().default('test.ping') }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Valid URL required' }, 400)
  const payload = { event: parsed.data.event, timestamp: new Date().toISOString(), user: user.id, message: 'Test webhook from Resume Generator' }
  const result = await deliverWebhook(parsed.data.url, parsed.data.event, payload, parsed.data.secret)
  return c.json({ ...result })
})

export default automation
