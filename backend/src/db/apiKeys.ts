import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getDb, nowSql } from './schema.js'
import type { ApiKeyRow } from '../types.js'

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(name: string): { prefix: string; secret: string; hash: string } {
  const secret = `rk_${randomBytes(24).toString('base64url')}`
  return { prefix: `rk_${name.replace(/[^a-z0-9]/gi, '').slice(0, 8)}`, secret, hash: hashApiKey(secret) }
}

export function createApiKey(userId: number, name: string, scopes: string[]): { row: ApiKeyRow; secret: string } {
  const db = getDb()
  const { prefix, secret, hash } = generateApiKey(name)
  const res = db
    .prepare('INSERT INTO api_keys (user_id, name, prefix, key_hash, scopes) VALUES (?, ?, ?, ?, ?)')
    .run(userId, name, prefix, hash, JSON.stringify(scopes))
  const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(res.lastInsertRowid) as ApiKeyRow
  return { row, secret }
}

export function findApiKey(key: string): (ApiKeyRow & { user_id: number }) | undefined {
  const row = getDb().prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked = 0').get(hashApiKey(key)) as ApiKeyRow | undefined
  if (row) {
    getDb().prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(nowSql(), row.id)
  }
  return row as (ApiKeyRow & { user_id: number }) | undefined
}

export function listApiKeys(userId: number): Array<Omit<ApiKeyRow, 'key_hash'>> {
  return getDb()
    .prepare('SELECT id, user_id, name, prefix, scopes, last_used_at, revoked, created_at FROM api_keys WHERE user_id = ? AND revoked = 0 ORDER BY created_at DESC')
    .all(userId) as Array<Omit<ApiKeyRow, 'key_hash'>>
}

export function revokeApiKey(userId: number, id: number): void {
  getDb().prepare('UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?').run(id, userId)
}
