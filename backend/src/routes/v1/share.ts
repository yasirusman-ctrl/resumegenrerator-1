import { Hono } from 'hono'
import { getDocByShareId, parseDocData } from '../../db/docs.js'
import { getTemplateById } from '../../db/marketplace.js'
import { renderDocHtml, renderDocText, renderDocDocx, renderDocLatex } from '../../services/exporter.js'
import { compileLaTeX } from '../../utils/compile.js'
import { trackEvent } from '../../db/analytics.js'
import { getABTestByShareId } from '../../db/analytics.js'
import { getDoc } from '../../db/docs.js'

const share = new Hono()

async function resolveDoc(shareId: string) {
  const doc = getDocByShareId(shareId)
  if (!doc || doc.visibility !== 'public') return null
  const template = doc.template_id ? getTemplateById(doc.template_id) : null
  return { doc, template }
}

share.get('/:shareId', async (c) => {
  const resolved = await resolveDoc(c.req.param('shareId'))
  if (!resolved) return c.json({ error: 'Resume not found' }, 404)
  const { doc, template } = resolved
  trackEvent({ docId: doc.id, shareId: c.req.param('shareId'), type: 'view', ref: c.req.header('referer') || null })
  const data = parseDocData(doc.data)
  const html = renderDocHtml({ data, template, accent: doc.accent, font: doc.font, locale: doc.language })
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.body(html)
})

share.get('/:shareId/export', async (c) => {
  const resolved = await resolveDoc(c.req.param('shareId'))
  if (!resolved) return c.json({ error: 'Resume not found' }, 404)
  const { doc, template } = resolved
  const format = (c.req.query('format') || 'pdf') as 'pdf' | 'html' | 'docx' | 'txt'
  const data = parseDocData(doc.data)
  const base: Parameters<typeof renderDocHtml>[0] = { data, template, accent: doc.accent, font: doc.font, locale: doc.language }
  trackEvent({ docId: doc.id, shareId: c.req.param('shareId'), type: 'download', variant: c.req.query('variant') || null })

  if (format === 'html') {
    c.header('Content-Type', 'text/html; charset=utf-8')
    return c.body(renderDocHtml(base))
  }
  if (format === 'txt') {
    c.header('Content-Type', 'text/plain; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="${doc.slug}.txt"`)
    return c.body(renderDocText(base))
  }
  if (format === 'docx') {
    const buffer = await renderDocDocx(base)
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    c.header('Content-Disposition', `attachment; filename="${doc.slug}.docx"`)
    return c.body(new Uint8Array(buffer))
  }
  const pdf = await compileLaTeX(renderDocLatex(base))
  c.header('Content-Type', 'application/pdf')
  c.header('Content-Disposition', `attachment; filename="${doc.slug}.pdf"`)
  return c.body(new Uint8Array(pdf))
})

share.get('/ab/:shareId', async (c) => {
  const test = getABTestByShareId(c.req.param('shareId'))
  if (!test) return c.json({ error: 'A/B test not found' }, 404)
  const docIds = JSON.parse(test.doc_ids) as number[]
  if (!docIds.length) return c.json({ error: 'A/B test has no variants' }, 400)

  const requested = c.req.query('variant')
  const index = requested !== null && requested !== undefined && Number.isInteger(Number(requested))
    ? Math.max(0, Math.min(docIds.length - 1, Number(requested)))
    : Math.floor(Math.random() * docIds.length)

  const doc = getDoc(docIds[index])
  if (!doc) return c.json({ error: 'Variant not found' }, 404)
  const template = doc.template_id ? getTemplateById(doc.template_id) : null
  trackEvent({ docId: doc.id, shareId: test.share_id, type: 'view', variant: String(index) })
  const data = parseDocData(doc.data)
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.body(renderDocHtml({ data, template, accent: doc.accent, font: doc.font, locale: doc.language }))
})

export default share
