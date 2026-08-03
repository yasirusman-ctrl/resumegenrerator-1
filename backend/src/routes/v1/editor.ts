import { Hono } from 'hono'
import { z } from 'zod'
import { getTemplateById, templateMeta } from '../../db/marketplace.js'
import { renderDocHtml, renderDocLatex } from '../../services/exporter.js'
import { validTemplates } from '../../templates/registry.js'

const editor = new Hono()

const previewSchema = z.object({
  data: z.object({
    sections: z.array(z.object({ id: z.string(), type: z.string(), title: z.string(), items: z.array(z.string()) })).default([]),
    contact: z.record(z.string(), z.string()).default({}),
    summary: z.string().default(''),
    skills: z.array(z.string()).default([]),
  }),
  template_id: z.number().int().nullable().optional(),
  template_key: z.string().optional(),
  accent: z.string().default('blue'),
  font: z.string().default('inter'),
  locale: z.string().default('en'),
  variables: z.record(z.string(), z.string()).default({}),
})

editor.post('/preview', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = previewSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400)
  const p = parsed.data
  const template = p.template_id ? getTemplateById(p.template_id) : null
  const input = { data: p.data, template, accent: p.accent, font: p.font, locale: p.locale, variables: p.variables }
  try {
    const html = renderDocHtml(input)
    const tex = renderDocLatex(input)
    return c.json({ html, tex })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Render failed' }, 500)
  }
})

editor.get('/templates', (c) => {
  const builtin = validTemplates.map(key => ({ id: null, name: key, slug: key, is_builtin: true, key }))
  return c.json({ templates: builtin })
})

editor.get('/templates/:id', (c) => {
  const t = getTemplateById(Number(c.req.param('id')))
  if (!t) return c.json({ error: 'Template not found' }, 404)
  return c.json({ template: { ...templateMeta(t), content_html: t.content_html, content_tex: t.content_tex } })
})

export default editor
