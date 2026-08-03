import { getDueSchedules, markScheduleRun, getSchedule } from '../db/automation.js'
import { getDoc, parseDocData } from '../db/docs.js'
import { getTemplateById } from '../db/marketplace.js'
import { compileLaTeX } from '../utils/compile.js'
import { renderDocLatex } from './exporter.js'
import { sendEmail } from './emailer.js'
import { queueWebhook, processPendingDeliveries, deliverWebhook } from './webhooks.js'
import { getActiveWebhooksForEvent } from '../db/automation.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('scheduler')

export function parseCron(cron: string): { minutes: Set<number>; hours: Set<number>; doms: Set<number>; months: Set<number>; dows: Set<number> } {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('Cron must have 5 fields: minute hour day-of-month month day-of-week')
  const field = (raw: string, min: number, max: number): Set<number> => {
    const out = new Set<number>()
    for (const part of raw.split(',')) {
      let m: RegExpMatchArray | null
      if ((m = part.match(/^\*\/\d+$/))) {
        const step = parseInt(m[0].slice(2))
        for (let v = min; v <= max; v += step) out.add(v)
      } else if ((m = part.match(/^(\d+)(?:-(\d+))?$/))) {
        const lo = parseInt(m[1])
        const hi = m[2] ? parseInt(m[2]) : lo
        if (lo < min || hi > max) throw new Error(`Value out of range in "${part}"`)
        for (let v = lo; v <= hi; v++) out.add(v)
      } else if (part === '*') {
        for (let v = min; v <= max; v++) out.add(v)
      } else {
        throw new Error(`Unsupported cron token: "${part}"`)
      }
    }
    return out
  }
  return {
    minutes: field(parts[0], 0, 59),
    hours: field(parts[1], 0, 23),
    doms: field(parts[2], 1, 31),
    months: field(parts[3], 1, 12),
    dows: field(parts[4], 0, 6),
  }
}

function matches(spec: ReturnType<typeof parseCron>, d: Date): boolean {
  if (!spec.minutes.has(d.getUTCMinutes())) return false
  if (!spec.hours.has(d.getUTCHours())) return false
  if (!spec.doms.has(d.getUTCDate())) return false
  if (!spec.months.has(d.getUTCMonth() + 1)) return false
  if (!spec.dows.has(d.getUTCDay())) return false
  return true
}

export function nextRunAfter(cron: string, from: Date): Date {
  const spec = parseCron(cron)
  const candidate = new Date(from.getTime())
  candidate.setUTCSeconds(0, 0)
  for (let i = 0; i < 366 * 24 * 60; i++) {
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)
    if (matches(spec, candidate)) return candidate
  }
  throw new Error('Could not find next run time for cron')
}

export async function runDueSchedules(now = new Date()): Promise<number> {
  const iso = now.toISOString()
  const due = getDueSchedules(iso)
  let ran = 0
  for (const schedule of due) {
    try {
      await executeSchedule(schedule.id)
      ran++
    } catch (err) {
      log.error({ err, scheduleId: schedule.id }, 'schedule execution failed')
    }
  }
  return ran
}

export async function executeSchedule(scheduleId: number): Promise<void> {
  const schedule = getSchedule(scheduleId)
  if (!schedule) return
  const now = new Date()

  let attachment: Buffer | undefined
  let attachmentName: string | undefined
  if (schedule.doc_id) {
    const doc = getDoc(schedule.doc_id)
    if (doc) {
      const data = parseDocData(doc.data)
      const template = doc.template_id ? getTemplateById(doc.template_id) : null
      const tex = renderDocLatex({ data, template, accent: doc.accent, font: doc.font, locale: doc.language })
      try {
        attachment = await compileLaTeX(tex)
        attachmentName = `${doc.slug || 'resume'}.pdf`
      } catch (err) {
        log.warn({ err }, 'latex compile failed for scheduled resume')
      }
    }
  }

  const payload = {
    event: 'schedule.completed',
    scheduleId: schedule.id,
    docId: schedule.doc_id,
    ranAt: now.toISOString(),
    attachment: attachmentName || null,
  }

  if (schedule.email_to) {
    await sendEmail({
      to: schedule.email_to,
      subject: 'Your resume was generated',
      text: 'Your scheduled resume generation completed.',
      attachments: attachment ? [{ filename: attachmentName!, content: attachment }] : undefined,
    })
  }

  if (schedule.webhook_url) {
    await deliverWebhook(schedule.webhook_url, 'schedule.completed', payload, null)
  }

  for (const webhook of getActiveWebhooksForEvent('schedule.completed')) {
    queueWebhook({ webhookId: webhook.id, event: 'schedule.completed', payload, scheduleId: schedule.id })
  }

  const next = nextRunAfter(schedule.cron, now).toISOString()
  markScheduleRun(schedule.id, next)
}

export function startScheduler(intervalMs = 30000): NodeJS.Timeout {
  const tick = async () => {
    try {
      await runDueSchedules()
      await processPendingDeliveries()
    } catch (err) {
      log.error({ err }, 'scheduler tick failed')
    }
  }
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  log.info({ intervalMs }, 'scheduler started')
  setTimeout(tick, 5000)
  return timer
}

export function stopScheduler(timer: NodeJS.Timeout): void {
  clearInterval(timer)
}
