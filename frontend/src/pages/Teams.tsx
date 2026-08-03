import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'
import { api, type Team, type TeamMember, type ResumeDoc } from '../lib/api'
import { navigate } from '../lib/router'

export function Teams() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [teamDocs, setTeamDocs] = useState<ResumeDoc[]>([])
  const [name, setName] = useState('')
  const [addUser, setAddUser] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadTeams = useCallback(async () => {
    try {
      const res = await api.get<{ teams: Team[] }>('/teams')
      setTeams(res.teams)
      if (res.teams.length && selected === null) setSelected(res.teams[0].id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load teams')
    }
  }, [selected])

  useEffect(() => { void loadTeams() }, [loadTeams])

  const loadTeam = useCallback(async (id: number) => {
    try {
      const res = await api.get<{ team: Team; members: TeamMember[] }>(`/teams/${id}`)
      setMembers(res.members)
      const docsRes = await api.get<{ docs: ResumeDoc[] }>(`/teams/${id}/docs`)
      setTeamDocs(docsRes.docs)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (selected !== null) void loadTeam(selected)
  }, [selected, loadTeam])

  const createTeam = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ team: Team }>('/teams', { name })
      setTeams(ts => [...ts, res.team])
      setSelected(res.team.id)
      setName('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const addMember = async () => {
    if (!addUser.trim() || selected === null) return
    try {
      await api.post(`/teams/${selected}/members`, { username: addUser, role: 'viewer' })
      setAddUser('')
      await loadTeam(selected)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Add member failed')
    }
  }

  const setRole = async (uid: number, role: string) => {
    if (selected === null) return
    try {
      await api.patch(`/teams/${selected}/members/${uid}`, { role })
      await loadTeam(selected)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Role change failed')
    }
  }

  const removeMember = async (uid: number) => {
    if (selected === null) return
    try {
      await api.delete(`/teams/${selected}/members/${uid}`)
      await loadTeam(selected)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  return (
    <div className="page">
      <div className="page-head"><h2><Users size={20} /> Teams</h2></div>
      {error && <div className="error-message">{error}</div>}
      <div className="row">
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="New team name" />
        <button className="btn" onClick={() => void createTeam()} disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={16} className="loader" /> : <Plus size={16} />} Create
        </button>
      </div>

      <div className="team-layout">
        <div className="team-list">
          {teams.map(t => (
            <div key={t.id} className={`team-item ${selected === t.id ? 'active' : ''}`} onClick={() => setSelected(t.id)}>
              <strong>{t.name}</strong>
              <span className="muted">{t.description || ''}</span>
            </div>
          ))}
        </div>

        {selected !== null && (
          <div className="card team-detail">
            <h4>Members</h4>
            <div className="row">
              <input className="form-input" value={addUser} onChange={e => setAddUser(e.target.value)} placeholder="username to invite" />
              <button className="btn btn-small" onClick={() => void addMember()}>Add</button>
            </div>
            {members.map(m => (
              <div key={m.id} className="comment-row">
                <span>{m.username}</span>
                <select className="form-select role-select" value={m.role} onChange={e => void setRole(m.id, e.target.value)}>
                  {['viewer', 'editor', 'owner'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="btn-icon-only" onClick={() => void removeMember(m.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            <h4>Team Resumes</h4>
            {teamDocs.map(d => (
              <div key={d.id} className="comment-row" onClick={() => navigate(`editor/${d.id}`)}>
                <span>{d.title}</span>
                <span className="muted">v{d.version}</span>
              </div>
            ))}
            {teamDocs.length === 0 && <p className="muted">No team resumes yet.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
