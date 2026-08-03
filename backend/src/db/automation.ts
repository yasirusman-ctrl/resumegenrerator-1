import { getDb, nowSql } from './schema.js'
import type { ScheduleRow, WebhookRow } from '../types.js'

export function createSchedule(data: {
  userId: number
  docId: number | null
  cron: string
  timezone?: string
  emailTo?: string | null
  webhookUrl?: string | null
}): ScheduleRow {
  const db = getDb()
  const res = db
    .prepare(`
      INSERT INTO schedules (user_id, doc_id, cron, timezone, email_to, webhook_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(data.userId, data.docId, data.cron, data.timezone || 'UTC', data.emailTo || null, data.webhookUrl || null)
  return getSchedule(Number(res.lastInsertRowid)) as ScheduleRow
}

export function getSchedule(id: number): ScheduleRow | undefined {
  return getDb().prepare('SELECT * FROM schedules WHERE id = ?').get(id) as ScheduleRow | undefined
}

export function listSchedulesByUser(userId: number): ScheduleRow[] {
  return getDb().prepare('SELECT * FROM schedules WHERE user_id = ? ORDER BY created_at DESC').all(userId) as ScheduleRow[]
}

export function updateSchedule(id: number, patch: Partial<Omit<ScheduleRow, 'id' | 'created_at'>>): void {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
  if (!entries.length) return
  const set = entries.map(([k]) => `${k} = ?`).join(', ')
  getDb().prepare(`UPDATE schedules SET ${set} WHERE id = ?`).run(...entries.map(([, v]) => v), id)
}

export function deleteSchedule(id: number): void {
  getDb().prepare('DELETE FROM schedules WHERE id = ?').run(id)
}

export function getDueSchedules(now: string): ScheduleRow[] {
  return getDb()
    .prepare('SELECT * FROM schedules WHERE enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?)')
    .all(now) as ScheduleRow[]
}

export function markScheduleRun(id: number, nextRunAt: string | null): void {
  getDb()
    .prepare('UPDATE schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?')
    .run(nowSql(), nextRunAt, id)
}

export function createWebhook(data: {
  userId: number
  name: string
  url: string
  secret?: string | null
  events: string[]
}): WebhookRow {
  const db = getDb()
  const res = db
    .prepare('INSERT INTO webhooks (user_id, name, url, secret, events) VALUES (?, ?, ?, ?, ?)')
    .run(data.userId, data.name, data.url, data.secret || null, JSON.stringify(data.events))
  return db.prepare('SELECT * FROM webhooks WHERE id = ?').get(res.lastInsertRowid) as WebhookRow
}

export function listWebhooksByUser(userId: number): WebhookRow[] {
  return getDb().prepare('SELECT * FROM webhooks WHERE user_id = ? ORDER BY created_at DESC').all(userId) as WebhookRow[]
}

export function getWebhook(id: number): WebhookRow | undefined {
  return getDb().prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRow | undefined
}

export function getActiveWebhooksForEvent(event: string) {
  return getDb()
    .prepare("SELECT * FROM webhooks WHERE active = 1 AND events LIKE ?")
    .all(`%"${event}"%`) as WebhookRow[]
}

export function deleteWebhook(id: number): void {
  getDb().prepare('DELETE FROM webhooks WHERE id = ?').run(id)
}

export function registerDelivery(data: {
  webhookId: number | null
  scheduleId?: number | null
  event: string
  payload: unknown
}): number {
  const db = getDb()
  const res = db
    .prepare('INSERT INTO webhook_deliveries (webhook_id, schedule_id, event, payload, attempts) VALUES (?, ?, ?, ?, 0)')
    .run(data.webhookId, data.scheduleId ?? null, data.event, JSON.stringify(data.payload))
  return Number(res.lastInsertRowid)
}

export function listPendingDeliveries(now: string): Array<{ id: number; webhook_id: number | null; event: string; payload: string; attempts: number }> {
  return getDb()
    .prepare('SELECT id, webhook_id, event, payload, attempts FROM webhook_deliveries WHERE delivered_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= ?)')
    .all(now) as Array<{ id: number; webhook_id: number | null; event: string; payload: string; attempts: number }>
}

export function markDelivery(id: number, status: number | null, body: string | null, delivered = false, nextAttemptAt: string | null = null): void {
  getDb()
    .prepare('UPDATE webhook_deliveries SET response_status = ?, response_body = ?, delivered_at = ?, next_attempt_at = ?, attempts = attempts + 1 WHERE id = ?')
    .run(status, body, delivered ? nowSql() : null, nextAttemptAt, id)
}
