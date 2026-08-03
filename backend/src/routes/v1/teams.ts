import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { createTeam, getTeam, listTeamsByUser, deleteTeam, addMember, removeMember, updateMemberRole, getTeamMembers, teamRole } from '../../db/teams.js'
import { findUserByEmail, findUserByUsername } from '../../db/users.js'
import { listDocsByTeam, createDoc } from '../../db/docs.js'
import { requireAuth } from '../../auth/middleware.js'
import { canManageTeam } from './perms.js'

const teams = new Hono()

function memberPerms(c: Context, teamId: number): 'owner' | 'editor' | 'viewer' | null {
  const user = (c as any).get('user') as { id: number }
  return teamRole(user.id, teamId) as 'owner' | 'editor' | 'viewer' | null
}

teams.get('/', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  return c.json({ teams: listTeamsByUser(user.id) })
})

teams.post('/', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ name: z.string().min(1).max(80) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Team name required' }, 400)
  return c.json({ team: createTeam(parsed.data.name, user.id) }, 201)
})

teams.get('/:id', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  const team = getTeam(Number(c.req.param('id')))
  if (!team) return c.json({ error: 'Team not found' }, 404)
  if (!teamRole(user.id, team.id)) return c.json({ error: 'Not a team member' }, 403)
  return c.json({ team, members: getTeamMembers(team.id), role: teamRole(user.id, team.id) })
})

teams.delete('/:id', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  const team = getTeam(Number(c.req.param('id')))
  if (!team) return c.json({ error: 'Team not found' }, 404)
  if (team.owner_id !== user.id) return c.json({ error: 'Only the owner can delete the team' }, 403)
  deleteTeam(team.id)
  return c.json({ ok: true })
})

teams.post('/:id/members', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const team = getTeam(Number(c.req.param('id')))
  if (!team) return c.json({ error: 'Team not found' }, 404)
  if (!canManageTeam(c, team.id)) return c.json({ error: 'Only owner/editor can add members' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ username: z.string().optional(), email: z.string().optional(), role: z.enum(['owner', 'editor', 'viewer']).default('viewer') }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'username or email required' }, 400)
  const target = parsed.data.username ? findUserByUsername(parsed.data.username) : parsed.data.email ? findUserByEmail(parsed.data.email) : undefined
  if (!target) return c.json({ error: 'User not found' }, 404)
  addMember(team.id, target.id, parsed.data.role)
  return c.json({ ok: true, member: { id: target.id, username: target.username, role: parsed.data.role } })
})

teams.patch('/:id/members/:uid', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const team = getTeam(Number(c.req.param('id')))
  if (!team) return c.json({ error: 'Team not found' }, 404)
  if (!canManageTeam(c, team.id)) return c.json({ error: 'No permission' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ role: z.enum(['owner', 'editor', 'viewer']) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid role' }, 400)
  if (Number(c.req.param('uid')) === user.id) return c.json({ error: 'Cannot change your own role' }, 400)
  updateMemberRole(team.id, Number(c.req.param('uid')), parsed.data.role)
  return c.json({ ok: true })
})

teams.delete('/:id/members/:uid', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  const team = getTeam(Number(c.req.param('id')))
  if (!team) return c.json({ error: 'Team not found' }, 404)
  if (!canManageTeam(c, team.id)) return c.json({ error: 'No permission' }, 403)
  if (Number(c.req.param('uid')) === user.id) return c.json({ error: 'Cannot remove yourself' }, 400)
  removeMember(team.id, Number(c.req.param('uid')))
  return c.json({ ok: true })
})

teams.get('/:id/docs', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  const team = getTeam(Number(c.req.param('id')))
  if (!team) return c.json({ error: 'Team not found' }, 404)
  if (!teamRole(user.id, team.id)) return c.json({ error: 'Not a team member' }, 403)
  const docs = listDocsByTeam(team.id)
  return c.json({ docs: docs.map(d => ({ ...d, data: JSON.parse(d.data) })) })
})

teams.post('/:id/docs', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const team = getTeam(Number(c.req.param('id')))
  if (!team) return c.json({ error: 'Team not found' }, 404)
  const role = memberPerms(c, team.id)
  if (!role || role === 'viewer') return c.json({ error: 'Viewers cannot create docs' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ title: z.string().min(1).max(120), data: z.record(z.string(), z.unknown()).optional() }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Title required' }, 400)
  const data = parsed.data.data
  const doc = createDoc(user.id, {
    title: parsed.data.title,
    data: (data as unknown as never) || { sections: [], contact: {}, summary: '', skills: [] },
    teamId: team.id,
    visibility: 'team',
  })
  return c.json({ doc }, 201)
})

export default teams
