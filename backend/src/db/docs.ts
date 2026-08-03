import { getDb, nowSql } from './schema.js'
import { nanoid } from 'nanoid'
import type { DocRow } from '../types.js'

export interface ResumeData {
  sections: Array<{ id: string; type: string; title: string; items: string[] }>
  contact: Record<string, string>
  summary: string
  skills: string[]
}

export function createDoc(userId: number, input: {
  title: string
  data: ResumeData
  templateKey?: string
  templateId?: number | null
  locale?: string
  accent?: string
  font?: string
  visibility?: string
  teamId?: number | null
}): DocRow {
  const db = getDb()
  const slug = `${nanoid(10)}`
  const shareId = input.visibility === 'public' ? nanoid(10) : null
  const res = db
    .prepare(`
      INSERT INTO resume_docs (user_id, title, slug, data, template_id, template_key, locale, accent, font, visibility, share_id, team_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      userId,
      input.title,
      slug,
      JSON.stringify(input.data),
      input.templateId ?? null,
      input.templateKey || 'modern',
      input.locale || 'en',
      input.accent || 'blue',
      input.font || 'inter',
      input.visibility || 'private',
      shareId,
      input.teamId ?? null,
      nowSql(),
      nowSql(),
    )
  db.prepare('INSERT INTO resume_versions (doc_id, version, data, created_by) VALUES (?, 1, ?, ?)')
    .run(res.lastInsertRowid, JSON.stringify(input.data), userId)
  return getDoc(Number(res.lastInsertRowid)) as DocRow
}

export function getDoc(id: number): DocRow | undefined {
  return getDb().prepare('SELECT * FROM resume_docs WHERE id = ?').get(id) as DocRow | undefined
}

export function getDocByShareId(shareId: string): DocRow | undefined {
  return getDb().prepare('SELECT * FROM resume_docs WHERE share_id = ?').get(shareId) as DocRow | undefined
}

export function getDocBySlug(slug: string): DocRow | undefined {
  return getDb().prepare('SELECT * FROM resume_docs WHERE slug = ?').get(slug) as DocRow | undefined
}

export function listDocsByUser(userId: number): DocRow[] {
  return getDb()
    .prepare('SELECT * FROM resume_docs WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as DocRow[]
}

export function listDocsByTeam(teamId: number): DocRow[] {
  return getDb()
    .prepare('SELECT * FROM resume_docs WHERE team_id = ? ORDER BY updated_at DESC')
    .all(teamId) as DocRow[]
}

export type DocPatch = Partial<Omit<DocRow, 'id' | 'created_at' | 'data' | 'user_id'>> & {
  data?: ResumeData
  user_id?: number | null
}

export function updateDoc(id: number, patch: DocPatch): DocRow | undefined {
  const db = getDb()
  const current = getDoc(id)
  if (!current) return undefined

  const entries: Array<[string, unknown]> = Object.entries(patch).filter(([, v]) => v !== undefined)

  if (patch.data !== undefined) {
    const nextVersion = current.version + 1
    entries.push(['version', nextVersion])
    db.prepare('INSERT INTO resume_versions (doc_id, version, data, created_by) VALUES (?, ?, ?, ?)')
      .run(id, nextVersion, JSON.stringify(patch.data), patch.user_id ?? null)
  }

  if (!entries.length) return current
  const set = entries.map(([k]) => `${k} = ?`).join(', ')
  db.prepare(`UPDATE resume_docs SET ${set}, updated_at = ? WHERE id = ?`)
    .run(...entries.map(([, v]) => v), nowSql(), id)
  return getDoc(id)
}

export function deleteDoc(id: number): void {
  getDb().prepare('DELETE FROM resume_docs WHERE id = ?').run(id)
}

export function listVersions(docId: number) {
  return getDb()
    .prepare('SELECT id, version, note, created_by, created_at FROM resume_versions WHERE doc_id = ? ORDER BY version DESC')
    .all(docId) as Array<{ id: number; version: number; note: string | null; created_by: number | null; created_at: string }>
}

export function getVersion(docId: number, version: number) {
  return getDb()
    .prepare('SELECT * FROM resume_versions WHERE doc_id = ? AND version = ?')
    .get(docId, version) as { id: number; doc_id: number; version: number; data: string; note: string | null; created_by: number | null; created_at: string } | undefined
}

export function setDocShare(docId: number, visibility: string): string {
  const db = getDb()
  const current = getDoc(docId)
  if (!current) throw new Error('Resume not found')
  let shareId = current.share_id
  if (visibility === 'public' && !shareId) {
    shareId = nanoid(10)
  } else if (visibility !== 'public') {
    shareId = null
  }
  db.prepare('UPDATE resume_docs SET visibility = ?, share_id = ? WHERE id = ?').run(visibility, shareId, docId)
  return shareId || ''
}

export function parseDocData(raw: string): ResumeData {
  try {
    const parsed = JSON.parse(raw) as ResumeData
    if (!Array.isArray(parsed.sections)) parsed.sections = []
    parsed.contact = parsed.contact || {}
    parsed.summary = parsed.summary || ''
    parsed.skills = parsed.skills || []
    return parsed
  } catch {
    return { sections: [], contact: {}, summary: '', skills: [] }
  }
}
