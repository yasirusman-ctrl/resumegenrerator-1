import { Hono } from 'hono'
import { z } from 'zod'
import {
  createDoc, getDoc, getDocBySlug, listDocsByUser, updateDoc, deleteDoc,
  listVersions, getVersion, setDocShare, parseDocData, type ResumeData,
} from '../../db/docs.js'
import { getTemplateById, templateMeta } from '../../db/marketplace.js'
import { addComment, listComments, resolveComment, deleteComment } from '../../db/teams.js'
import { requireAuth } from '../../auth/middleware.js'
import { requireDocAccess, docAccess } from './perms.js'
import { renderDocHtml, renderDocText, renderDocDocx, renderDocLatex } from '../../services/exporter.js'
import { compileLaTeX } from '../../utils/compile.js'
import { validateResume } from '../../services/validator.js'
import { trackEvent, docStats, recentEvents } from '../../db/analytics.js'
import { incrementDownload } from '../../db/marketplace.js'

const docs = new Hono()

const sectionSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  items: z.array(z.string()),
})

const dataSchema = z.object({
  sections: z.array(sectionSchema).default([]),
  contact: z.record(z.string(), z.string()).default({}),
  summary: z.string().default(''),
  skills: z.array(z.string()).default([]),
})

const docSchema = z.object({
  title: z.string().min(1).max(120),
  data: dataSchema,
  template_id: z.number().int().nullable().optional(),
  template_key: z.string().optional(),
  locale: z.string().optional(),
  accent: z.string().optional(),
  font: z.string().optional(),
  visibility: z.enum(['private', 'public', 'team']).optional(),
  team_id: z.number().int().nullable().optional(),
})

docs.post('/', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const parsed = docSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400)
  const doc = createDoc(user.id, parsed.data)
  return c.json({ doc }, 201)
})

docs.get('/', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const docs = listDocsByUser(user.id)
  return c.json({ docs: docs.map(d => ({ ...d, data: parseDocData(d.data) })) })
})

docs.get('/:id', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'viewer')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  const template = doc.template_id ? getTemplateById(doc.template_id) : null
  return c.json({ doc: { ...doc, data: parseDocData(doc.data) }, template: template ? templateMeta(template) : null, access: docAccess(c, doc) })
})

docs.patch('/:id', requireAuth, async (c) => {
  const doc = requireDocAccess(c, 'editor')
  if (!doc) return c.json({ error: 'Resume not found or no write access' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const parsed = docSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400)
  const updated = updateDoc(doc.id, { ...parsed.data, user_id: (c as any).get('user').id })
  return c.json({ doc: updated ? { ...updated, data: parseDocData(updated.data) } : null })
})

docs.delete('/:id', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'owner')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  deleteDoc(doc.id)
  return c.json({ ok: true })
})

docs.get('/:id/versions', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'viewer')
  if (!doc) return c.json({ error: 'Resume not found' }, 404)
  return c.json({ versions: listVersions(doc.id) })
})

docs.get('/:id/versions/:version', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'viewer')
  if (!doc) return c.json({ error: 'Resume not found' }, 404)
  const version = getVersion(doc.id, Number(c.req.param('version')))
  if (!version) return c.json({ error: 'Version not found' }, 404)
  return c.json({ version })
})

docs.post('/:id/versions/:version/restore', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'editor')
  if (!doc) return c.json({ error: 'Resume not found or no write access' }, 404)
  const version = getVersion(doc.id, Number(c.req.param('version')))
  if (!version) return c.json({ error: 'Version not found' }, 404)
  const updated = updateDoc(doc.id, { data: JSON.parse(version.data), user_id: (c as any).get('user').id })
  return c.json({ ok: true, version: updated?.version })
})

docs.post('/:id/share', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'owner')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  const body = (c.req.query('visibility') as 'public' | 'private' | undefined) || 'public'
  const shareId = setDocShare(doc.id, body)
  return c.json({ ok: true, visibility: body, share_id: shareId || null, url: shareId ? `/share/${shareId}` : null })
})

docs.get('/:id/export', requireAuth, async (c) => {
  const doc = requireDocAccess(c, 'viewer')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  const format = (c.req.query('format') || 'pdf') as 'pdf' | 'html' | 'docx' | 'txt'
  const data = parseDocData(doc.data)
  const template = doc.template_id ? getTemplateById(doc.template_id) : null
  const base: Parameters<typeof renderDocHtml>[0] = { data, template, accent: doc.accent, font: doc.font, locale: doc.language }

  try {
    if (format === 'html') {
      trackEvent({ docId: doc.id, type: 'download', variant: c.req.query('variant') || null })
      c.header('Content-Type', 'text/html; charset=utf-8')
      return c.body(renderDocHtml(base))
    }
    if (format === 'txt') {
      trackEvent({ docId: doc.id, type: 'download', variant: c.req.query('variant') || null })
      c.header('Content-Type', 'text/plain; charset=utf-8')
      c.header('Content-Disposition', `attachment; filename="${doc.slug}.txt"`)
      return c.body(renderDocText(base))
    }
    if (format === 'docx') {
      const buffer = await renderDocDocx(base)
      trackEvent({ docId: doc.id, type: 'download', variant: c.req.query('variant') || null })
      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      c.header('Content-Disposition', `attachment; filename="${doc.slug}.docx"`)
      return c.body(new Uint8Array(buffer))
    }
    const tex = renderDocLatex(base)
    const pdf = await compileLaTeX(tex)
    trackEvent({ docId: doc.id, type: 'download', variant: c.req.query('variant') || null })
    if (doc.template_id) incrementDownload(doc.template_id)
    c.header('Content-Type', 'application/pdf')
    c.header('Content-Disposition', `attachment; filename="${doc.slug}.pdf"`)
    return c.body(new Uint8Array(pdf))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Export failed' }, 500)
  }
})

docs.get('/:id/validate', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'viewer')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  return c.json(validateResume(parseDocData(doc.data)))
})

docs.get('/:id/comments', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'viewer')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  return c.json({ comments: listComments(doc.id) })
})

docs.post('/:id/comments', requireAuth, async (c) => {
  const doc = requireDocAccess(c, 'viewer')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ body: z.string().min(1).max(2000) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Comment body required' }, 400)
  const comment = addComment(doc.id, (c as any).get('user').id, parsed.data.body)
  return c.json({ comment }, 201)
})

docs.post('/:id/comments/:cid/resolve', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'editor')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  resolveComment(Number(c.req.param('cid')))
  return c.json({ ok: true })
})

docs.delete('/:id/comments/:cid', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'editor')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  deleteComment(Number(c.req.param('cid')))
  return c.json({ ok: true })
})

docs.get('/:id/analytics', requireAuth, (c) => {
  const doc = requireDocAccess(c, 'owner')
  if (!doc) return c.json({ error: 'Resume not found or no access' }, 404)
  return c.json({ stats: docStats(doc.id), events: recentEvents(doc.id, 200) })
})

export default docs
