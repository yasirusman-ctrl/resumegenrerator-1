import type { Context } from 'hono'
import { getDoc } from '../../db/docs.js'
import { teamRole, getTeam } from '../../db/teams.js'
import type { DocRow } from '../../types.js'

export type DocAccess = 'owner' | 'editor' | 'viewer' | 'none'

export function docAccess(c: Context, doc: DocRow): DocAccess {
  const user = (c as any).get('user') as { id: number; role: string } | undefined
  if (!user) return doc.visibility === 'public' ? 'viewer' : 'none'
  if (user.role === 'admin') return 'owner'
  if (doc.user_id === user.id) return 'owner'
  if (doc.team_id) {
    const role = teamRole(user.id, doc.team_id)
    if (role === 'owner' || role === 'editor') return 'editor'
    if (role === 'viewer') return 'viewer'
  }
  return doc.visibility === 'public' ? 'viewer' : 'none'
}

export function requireDocAccess(c: Context, min: DocAccess): DocRow | null {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return null
  const doc = getDoc(id)
  if (!doc) return null
  const access = docAccess(c, doc)
  const rank = { none: 0, viewer: 1, editor: 2, owner: 3 } as const
  if (rank[access] < rank[min]) return null
  return doc
}

export function canManageTeam(c: Context, teamId: number): boolean {
  const user = (c as any).get('user') as { id: number } | undefined
  if (!user) return false
  const team = getTeam(teamId)
  if (!team) return false
  const role = teamRole(user.id, teamId)
  return role === 'owner' || role === 'editor'
}
