import { createTransport } from 'nodemailer'
import { createLogger } from '../utils/logger.js'

const log = createLogger('mailer')

const smtpUrl = process.env.SMTP_URL
const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@resumegen.local'

function getTransport(): ReturnType<typeof createTransport> | null {
  if (!smtpUrl) return null
  try {
    return createTransport(smtpUrl)
  } catch (err) {
    log.warn({ err }, 'invalid SMTP_URL')
    return null
  }
}

export async function sendEmail(opts: {
  to: string
  subject: string
  text: string
  attachments?: Array<{ filename: string; content: Buffer }>
}): Promise<{ delivered: boolean; mode: 'smtp' | 'logged' }> {
  const transport = getTransport()
  if (!transport) {
    log.info({ to: opts.to, subject: opts.subject }, 'email would be sent (no SMTP_URL configured)')
    return { delivered: false, mode: 'logged' }
  }
  try {
    await transport.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, attachments: opts.attachments })
    return { delivered: true, mode: 'smtp' }
  } catch (err) {
    log.error({ err, to: opts.to }, 'email send failed')
    return { delivered: false, mode: 'smtp' }
  }
}
