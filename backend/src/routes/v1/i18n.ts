import { Hono } from 'hono'
import { z } from 'zod'
import { getTranslations, upsertTranslations, listLangs } from '../../db/teams.js'
import { requireAuth } from '../../auth/middleware.js'

const i18n = new Hono()

i18n.get('/langs', (c) => c.json({ langs: listLangs() }))

i18n.get('/:lang', (c) => {
  const translations = getTranslations(c.req.param('lang'))
  return c.json({ lang: c.req.param('lang'), translations })
})

i18n.put('/', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ lang: z.string().min(2).max(8), entries: z.record(z.string(), z.string()) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'lang and entries required' }, 400)
  upsertTranslations(parsed.data.lang, parsed.data.entries)
  return c.json({ ok: true })
})

export default i18n
