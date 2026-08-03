import { getDb, nowSql } from './schema.js'
import type { UserRow } from '../types.js'

export function createUser(data: {
  email: string
  username: string
  name?: string
  passwordHash: string
}): UserRow {
  const db = getDb()
  const res = db
    .prepare('INSERT INTO users (email, username, name, password_hash) VALUES (?, ?, ?, ?)')
    .run(data.email, data.username, data.name || null, data.passwordHash)
  db.prepare('INSERT INTO user_settings (user_id, default_template) VALUES (?, ?)').run(res.lastInsertRowid, 'modern')
  return getUserById(Number(res.lastInsertRowid)) as UserRow
}

export function getUserById(id: number): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

export function findUserByEmail(email: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email) as UserRow | undefined
}

export function findUserByUsername(username: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
}

export function updateUser(id: number, patch: Partial<Pick<UserRow, 'name' | 'bio' | 'avatar'>>): void {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
  if (!entries.length) return
  const set = entries.map(([k]) => `${k} = ?`).join(', ')
  getDb()
    .prepare(`UPDATE users SET ${set}, updated_at = ? WHERE id = ?`)
    .run(...entries.map(([, v]) => v), nowSql(), id)
}

export function getUserSettings(userId: number) {
  return getDb().prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as
    | { default_template: string | null; default_accent: string; default_font: string; locale: string; email_notifications: number }
    | undefined
}

export function saveUserSettings(userId: number, patch: Record<string, string | number | null>): void {
  const current = getUserSettings(userId) || { default_template: 'modern', default_accent: 'blue', default_font: 'inter', locale: 'en', email_notifications: 1 }
  const merged = { ...current, ...patch }
  getDb()
    .prepare(`
      INSERT INTO user_settings (user_id, default_template, default_accent, default_font, locale, email_notifications)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        default_template = excluded.default_template,
        default_accent = excluded.default_accent,
        default_font = excluded.default_font,
        locale = excluded.locale,
        email_notifications = excluded.email_notifications
    `)
    .run(userId, merged.default_template, merged.default_accent, merged.default_font, merged.locale, merged.email_notifications)
}

export function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, username: u.username, name: u.name, bio: u.bio, role: u.role, avatar: u.avatar }
}
