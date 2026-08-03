import { getDb, nowSql } from './schema.js'
import type { TemplateRow } from '../types.js'

export function listTemplates(opts: { status?: string; authorId?: number; query?: string; limit?: number } = {}) {
  const db = getDb()
  const where: string[] = []
  const params: unknown[] = []
  if (opts.status) {
    where.push('status = ?')
    params.push(opts.status)
  }
  if (opts.authorId !== undefined) {
    where.push('author_id = ?')
    params.push(opts.authorId)
  }
  if (opts.query) {
    where.push('(name LIKE ? OR description LIKE ? OR tags LIKE ?)')
    params.push(`%${opts.query}%`, `%${opts.query}%`, `%${opts.query}%`)
  }
  const limit = Math.min(opts.limit || 50, 200)
  const sql = `SELECT * FROM templates ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY downloads DESC, rating_total DESC LIMIT ?`
  return db.prepare(sql).all(...params, limit) as TemplateRow[]
}

export function getTemplateBySlug(slug: string): TemplateRow | undefined {
  return getDb().prepare('SELECT * FROM templates WHERE slug = ?').get(slug) as TemplateRow | undefined
}

export function getTemplateById(id: number): TemplateRow | undefined {
  return getDb().prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined
}

export function createTemplate(data: {
  name: string
  description?: string
  authorId: number | null
  contentTex: string
  contentHtml: string
  variables: unknown[]
  language?: string
  tags?: string[]
  isBuiltin?: boolean
  status?: string
}): TemplateRow {
  const db = getDb()
  const slug = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Math.floor(Math.random() * 100000)}`
  const res = db
    .prepare(`
      INSERT INTO templates (name, slug, description, author_id, content_tex, content_html, variables, language, tags, is_builtin, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      data.name,
      slug,
      data.description || null,
      data.authorId,
      data.contentTex,
      data.contentHtml,
      JSON.stringify(data.variables || []),
      data.language || 'en',
      JSON.stringify(data.tags || []),
      data.isBuiltin ? 1 : 0,
      data.status || 'published',
      nowSql(),
      nowSql(),
    )
  return getTemplateById(Number(res.lastInsertRowid)) as TemplateRow
}

export function updateTemplate(id: number, patch: Partial<Pick<TemplateRow, 'name' | 'description' | 'content_tex' | 'content_html' | 'variables' | 'language' | 'tags' | 'status'>>): void {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
  if (!entries.length) return
  const set = entries.map(([k]) => `${k} = ?`).join(', ')
  getDb().prepare(`UPDATE templates SET ${set}, updated_at = ? WHERE id = ?`).run(...entries.map(([, v]) => v), nowSql(), id)
}

export function incrementDownload(id: number): void {
  getDb().prepare('UPDATE templates SET downloads = downloads + 1 WHERE id = ?').run(id)
}

export function rateTemplate(templateId: number, userId: number, rating: number, comment?: string): TemplateRow | undefined {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM template_ratings WHERE template_id = ? AND user_id = ?').get(templateId, userId) as { rating: number; comment: string | null } | undefined
  if (existing) {
    db.prepare('UPDATE template_ratings SET rating = ?, comment = ? WHERE template_id = ? AND user_id = ?')
      .run(rating, comment || null, templateId, userId)
    db.prepare('UPDATE templates SET rating_total = rating_total - ? + ?, rating_count = rating_count WHERE id = ?')
      .run(existing.rating, rating, templateId)
  } else {
    db.prepare('INSERT INTO template_ratings (template_id, user_id, rating, comment) VALUES (?, ?, ?, ?)')
      .run(templateId, userId, rating, comment || null)
    db.prepare('UPDATE templates SET rating_total = rating_total + ?, rating_count = rating_count + 1 WHERE id = ?')
      .run(rating, templateId)
  }
  return getTemplateById(templateId)
}

export function getTemplateRating(templateId: number, userId: number) {
  return getDb().prepare('SELECT rating, comment FROM template_ratings WHERE template_id = ? AND user_id = ?').get(templateId, userId)
}

export function favoriteTemplate(templateId: number, userId: number): void {
  getDb().prepare('INSERT OR IGNORE INTO template_favorites (template_id, user_id) VALUES (?, ?)').run(templateId, userId)
}

export function unfavoriteTemplate(templateId: number, userId: number): void {
  getDb().prepare('DELETE FROM template_favorites WHERE template_id = ? AND user_id = ?').run(templateId, userId)
}

export function isFavorited(templateId: number, userId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM template_favorites WHERE template_id = ? AND user_id = ?').get(templateId, userId)
}

export function listFavorites(userId: number): TemplateRow[] {
  return getDb()
    .prepare('SELECT t.* FROM templates t JOIN template_favorites f ON f.template_id = t.id WHERE f.user_id = ? ORDER BY f.created_at DESC')
    .all(userId) as TemplateRow[]
}

export function templateMeta(t: TemplateRow) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    author_id: t.author_id,
    language: t.language,
    tags: JSON.parse(t.tags),
    downloads: t.downloads,
    status: t.status,
    is_builtin: !!t.is_builtin,
    rating: t.rating_count ? Math.round((t.rating_total / t.rating_count) * 10) / 10 : 0,
    rating_count: t.rating_count,
    variables: JSON.parse(t.variables),
    created_at: t.created_at,
  }
}
