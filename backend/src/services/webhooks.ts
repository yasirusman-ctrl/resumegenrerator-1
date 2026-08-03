import { createHmac } from 'node:crypto'
import { registerDelivery, markDelivery, listPendingDeliveries, getWebhook } from '../db/automation.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('webhooks')

const MAX_ATTEMPTS = 5

export function signPayload(secret: string | null | undefined, body: string): string | null {
  if (!secret) return null
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

export async function deliverWebhook(url: string, event: string, payload: unknown, secret?: string | null, opts: { timeoutMs?: number } = {}): Promise<{ ok: boolean; status: number }> {
  try {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'resume-generator/1.0' }
    const sig = signPayload(secret, body)
    if (sig) headers['X-Resume-Signature'] = sig
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(opts.timeoutMs || 10000),
    })
    return { ok: res.ok, status: res.status }
  } catch (err) {
    log.warn({ err, url }, 'webhook delivery failed')
    return { ok: false, status: 0 }
  }
}

export function queueWebhook(data: { webhookId: number | null; event: string; payload: unknown; scheduleId?: number }): number {
  return registerDelivery({ webhookId: data.webhookId, scheduleId: data.scheduleId, event: data.event, payload: data.payload })
}

export async function processPendingDeliveries(now = new Date().toISOString()): Promise<number> {
  const pending = listPendingDeliveries(now)
  let handled = 0
  for (const delivery of pending) {
    const webhook = delivery.webhook_id ? getWebhook(delivery.webhook_id) : null
    if (!webhook) {
      markDelivery(delivery.id, null, null, true)
      handled++
      continue
    }
    const result = await deliverWebhook(webhook.url, delivery.event, JSON.parse(delivery.payload), webhook.secret)
    const nextAttempts = delivery.attempts + 1
    if (result.ok || nextAttempts >= MAX_ATTEMPTS) {
      markDelivery(delivery.id, result.status, result.ok ? null : 'max attempts reached', true)
    } else {
      const backoffMs = 1000 * Math.pow(2, nextAttempts)
      const nextAt = new Date(Date.now() + backoffMs).toISOString()
      markDelivery(delivery.id, result.status, null, false, nextAt)
    }
    handled++
  }
  return handled
}
