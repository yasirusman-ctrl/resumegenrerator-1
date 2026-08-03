import { getDb, nowSql } from './schema.js'
import type { TeamRow, CommentRow } from '../types.js'

export function createTeam(name: string, ownerId: number): TeamRow {
  const db = getDb()
  const res = db.prepare('INSERT INTO teams (name, owner_id) VALUES (?, ?)').run(name, ownerId)
  db.prepare("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')").run(res.lastInsertRowid, ownerId)
  return getTeam(Number(res.lastInsertRowid)) as TeamRow
}

export function getTeam(id: number): TeamRow | undefined {
  return getDb().prepare('SELECT * FROM teams WHERE id = ?').get(id) as TeamRow | undefined
}

export function listTeamsByUser(userId: number) {
  return getDb()
    .prepare('SELECT t.*, m.role FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ? ORDER BY t.created_at DESC')
    .all(userId) as Array<TeamRow & { role: string }>
}

export function deleteTeam(id: number): void {
  getDb().prepare('DELETE FROM teams WHERE id = ?').run(id)
}

export function addMember(teamId: number, userId: number, role = 'viewer'): void {
  getDb().prepare('INSERT OR IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(teamId, userId, role)
}

export function removeMember(teamId: number, userId: number): void {
  getDb().prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId)
}

export function updateMemberRole(teamId: number, userId: number, role: string): void {
  getDb().prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run(role, teamId, userId)
}

export function getTeamMembers(teamId: number) {
  return getDb()
    .prepare('SELECT u.id, u.username, u.name, u.email, u.avatar, m.role, m.created_at FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ?')
    .all(teamId) as Array<{ id: number; username: string; name: string | null; email: string; avatar: string | null; role: string; created_at: string }>
}

export function teamRole(userId: number, teamId: number): string | null {
  const row = getDb().prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId) as { role: string } | undefined
  return row ? row.role : null
}

export function addComment(docId: number, userId: number, body: string): CommentRow {
  const db = getDb()
  const res = db.prepare('INSERT INTO comments (doc_id, user_id, body) VALUES (?, ?, ?)').run(docId, userId, body)
  return db.prepare('SELECT * FROM comments WHERE id = ?').get(res.lastInsertRowid) as CommentRow
}

export function listComments(docId: number) {
  return getDb()
    .prepare('SELECT c.*, u.username, u.name, u.avatar FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.doc_id = ? ORDER BY c.created_at ASC')
    .all(docId) as Array<CommentRow & { username: string | null; name: string | null; avatar: string | null }>
}

export function resolveComment(id: number, resolved = true): void {
  getDb().prepare('UPDATE comments SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id)
}

export function deleteComment(id: number): void {
  getDb().prepare('DELETE FROM comments WHERE id = ?').run(id)
}

export function upsertTranslations(lang: string, entries: Record<string, string>): void {
  const db = getDb()
  const upsert = db.prepare(`
    INSERT INTO translations (lang, key, value) VALUES (?, ?, ?)
    ON CONFLICT(lang, key) DO UPDATE SET value = excluded.value
  `)
  for (const [key, value] of Object.entries(entries)) upsert.run(lang, key, value)
}

export function getTranslations(lang: string): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM translations WHERE lang = ?').all(lang) as Array<{ key: string; value: string }>
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

export function listLangs(): string[] {
  return (getDb().prepare('SELECT DISTINCT lang FROM translations ORDER BY lang').all() as Array<{ lang: string }>).map(r => r.lang)
}
