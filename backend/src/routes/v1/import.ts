import { Hono } from 'hono'
import { z } from 'zod'
import { importFromGitHub, parseLinkedIn, sourceToResumeData, applyMapping, SOURCE_FIELDS, type ImportSource } from '../../services/importer.js'
import { saveImport } from '../../db/analytics.js'
import { requireAuth, optionalAuth } from '../../auth/middleware.js'
import { createDoc } from '../../db/docs.js'

const imp = new Hono()

imp.get('/fields', (c) => c.json({ fields: SOURCE_FIELDS }))

imp.post('/github', optionalAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ username: z.string().min(1).max(39).regex(/^[a-zA-Z0-9-]+$/) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid GitHub username' }, 400)
  try {
    const source = await importFromGitHub(parsed.data.username)
    saveImport((c as any).get('user')?.id ?? null, 'github', { username: parsed.data.username }, source)
    return c.json({ source })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Import failed' }, 500)
  }
})

imp.post('/linkedin', optionalAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ text: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Text required' }, 400)
  const source = parseLinkedIn(parsed.data.text)
  saveImport((c as any).get('user')?.id ?? null, 'linkedin', { preview: parsed.data.text.slice(0, 500) }, source)
  return c.json({ source })
})

imp.post('/map', optionalAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ source: z.record(z.string(), z.unknown()), mapping: z.record(z.string(), z.string()) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'source and mapping required' }, 400)
  const source = parsed.data.source as unknown as ImportSource
  const mapped = applyMapping(source, parsed.data.mapping)
  return c.json({ source: mapped })
})

imp.post('/to-resume', optionalAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ source: z.record(z.string(), z.unknown()), title: z.string().default('Imported Resume') }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'source required' }, 400)
  const data = sourceToResumeData(parsed.data.source as unknown as ImportSource)
  const user = (c as any).get('user') as { id: number } | undefined
  if (!user) return c.json({ data })
  const doc = createDoc(user.id, { title: parsed.data.title, data })
  return c.json({ doc: { ...doc, data }, data })
})

export default imp
