import { getDb, nowSql } from './schema.js'
import { nanoid } from 'nanoid'

export function trackEvent(data: { docId?: number | null; shareId?: string | null; type: 'view' | 'download'; variant?: string | null; ref?: string | null }): void {
  getDb()
    .prepare('INSERT INTO analytics (doc_id, share_id, type, variant, ref) VALUES (?, ?, ?, ?, ?)')
    .run(data.docId ?? null, data.shareId ?? null, data.type, data.variant ?? null, data.ref ?? null)
}

export function docStats(docId: number): { views: number; downloads: number } {
  const row = getDb()
    .prepare("SELECT SUM(CASE WHEN type = 'view' THEN 1 ELSE 0 END) as views, SUM(CASE WHEN type = 'download' THEN 1 ELSE 0 END) as downloads FROM analytics WHERE doc_id = ?")
    .get(docId) as { views: number | null; downloads: number | null }
  return { views: row.views || 0, downloads: row.downloads || 0 }
}

export function recentEvents(docId: number, limit = 100) {
  return getDb().prepare('SELECT * FROM analytics WHERE doc_id = ? ORDER BY created_at DESC LIMIT ?').all(docId, limit) as Array<Record<string, unknown>>
}

export function createABTest(ownerId: number, name: string, docIds: number[]): { id: number; share_id: string } {
  const db = getDb()
  const res = db
    .prepare('INSERT INTO ab_tests (owner_id, name, doc_ids, share_id) VALUES (?, ?, ?, ?)')
    .run(ownerId, name, JSON.stringify(docIds), nanoid(10))
  return db.prepare('SELECT id, share_id FROM ab_tests WHERE id = ?').get(res.lastInsertRowid) as { id: number; share_id: string }
}

export function getABTestByShareId(shareId: string) {
  return getDb().prepare('SELECT * FROM ab_tests WHERE share_id = ?').get(shareId) as
    | { id: number; owner_id: number; name: string; doc_ids: string; status: string; share_id: string; created_at: string }
    | undefined
}

export function listABTests(ownerId: number) {
  return getDb().prepare('SELECT id, name, doc_ids, status, share_id, created_at FROM ab_tests WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId) as Array<{
    id: number
    name: string
    doc_ids: string
    status: string
    share_id: string
    created_at: string
  }>
}

export function abTestStats(test: { id: number; doc_ids: string; name: string }) {
  const docIds = JSON.parse(test.doc_ids) as number[]
  return docIds.map(docId => {
    const stats = docStats(docId)
    return { docId, ...stats }
  })
}

export function saveImport(userId: number | null, source: string, raw: unknown, mapped: unknown): void {
  getDb()
    .prepare('INSERT INTO imports (user_id, source, raw, mapped) VALUES (?, ?, ?, ?)')
    .run(userId, source, JSON.stringify(raw), JSON.stringify(mapped))
}

export function shareEventForVariant(shareId: string): string | null {
  const row = getDb().prepare("SELECT doc_id, variant FROM analytics WHERE share_id = ? AND type = 'view' ORDER BY id DESC LIMIT 1").get(shareId) as
    | { doc_id: number | null; variant: string | null }
    | undefined
  return row?.variant ?? null
}
