import { Hono } from 'hono'
import { z } from 'zod'
import {
  listTemplates, getTemplateBySlug, createTemplate, updateTemplate, templateMeta,
  rateTemplate, favoriteTemplate, unfavoriteTemplate, isFavorited, listFavorites,
  getTemplateRating,
} from '../../db/marketplace.js'
import { requireAuth } from '../../auth/middleware.js'

const marketplace = new Hono()

marketplace.get('/', (c) => {
  const query = c.req.query('query')
  const authorId = c.req.query('author') ? Number(c.req.query('author')) : undefined
  const status = c.req.query('status') || 'published'
  const templates = listTemplates({ query, authorId, status, limit: Number(c.req.query('limit') || 50) })
  return c.json({ templates: templates.map(templateMeta) })
})

marketplace.get('/favorites', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number; role: string }
  return c.json({ templates: listFavorites(user.id).map(templateMeta) })
})

marketplace.get('/mine', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number; role: string }
  return c.json({ templates: listTemplates({ authorId: user.id, status: undefined }).map(templateMeta) })
})

marketplace.get('/:slug', (c) => {
  const t = getTemplateBySlug(c.req.param('slug') as string)
  if (!t) return c.json({ error: 'Template not found' }, 404)
  return c.json({ template: { ...templateMeta(t), content_html: t.content_html, content_tex: t.content_tex } })
})

const templateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  content_html: z.string().min(1, 'HTML template content required'),
  content_tex: z.string().optional(),
  variables: z.array(z.object({ key: z.string(), label: z.string().optional(), type: z.enum(['string', 'text', 'color']).optional(), default: z.string().optional() })).optional(),
  language: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

marketplace.post('/', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number; role: string }
  const body = await c.req.json().catch(() => ({}))
  const parsed = templateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400)
  const t = createTemplate({
    name: parsed.data.name,
    description: parsed.data.description,
    authorId: user.id,
    contentTex: parsed.data.content_tex || '',
    contentHtml: parsed.data.content_html,
    variables: parsed.data.variables || [],
    language: parsed.data.language || 'en',
    tags: parsed.data.tags || [],
  })
  return c.json({ template: templateMeta(t) }, 201)
})

marketplace.patch('/:slug', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number; role: string }
  const t = getTemplateBySlug(c.req.param('slug') as string)
  if (!t) return c.json({ error: 'Template not found' }, 404)
  if (t.author_id !== user.id && user.role !== 'admin') return c.json({ error: 'Not your template' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const parsed = templateSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed' }, 400)
  updateTemplate(t.id, {
    name: parsed.data.name,
    description: parsed.data.description,
    content_tex: parsed.data.content_tex,
    content_html: parsed.data.content_html,
    variables: parsed.data.variables ? JSON.stringify(parsed.data.variables) : undefined,
    language: parsed.data.language,
    tags: parsed.data.tags ? JSON.stringify(parsed.data.tags) : undefined,
  })
  return c.json({ ok: true })
})

marketplace.post('/:slug/rate', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number; role: string }
  const t = getTemplateBySlug(c.req.param('slug') as string)
  if (!t) return c.json({ error: 'Template not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Rating must be 1-5' }, 400)
  const updated = rateTemplate(t.id, user.id, parsed.data.rating, parsed.data.comment)
  return c.json({ template: updated ? templateMeta(updated) : null })
})

marketplace.post('/:slug/favorite', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number; role: string }
  const t = getTemplateBySlug(c.req.param('slug') as string)
  if (!t) return c.json({ error: 'Template not found' }, 404)
  favoriteTemplate(t.id, user.id)
  return c.json({ ok: true, favorited: true })
})

marketplace.delete('/:slug/favorite', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number; role: string }
  const t = getTemplateBySlug(c.req.param('slug') as string)
  if (!t) return c.json({ error: 'Template not found' }, 404)
  unfavoriteTemplate(t.id, user.id)
  return c.json({ ok: true, favorited: false })
})

marketplace.get('/:slug/me', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number; role: string }
  const t = getTemplateBySlug(c.req.param('slug') as string)
  if (!t) return c.json({ error: 'Template not found' }, 404)
  return c.json({
    favorited: isFavorited(t.id, user.id),
    rating: getTemplateRating(t.id, user.id) || null,
  })
})

export default marketplace
