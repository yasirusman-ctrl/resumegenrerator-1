import { useState } from 'react'
import { Github, Linkedin, Loader2 } from 'lucide-react'
import { api, type ResumeData, type ResumeDoc, type Section } from '../lib/api'
import { navigate } from '../lib/router'

interface ImportSource {
  name: string
  email: string
  phone: string
  location: string
  website: string
  linkedin: string
  github: string
  summary: string
  skills: string[]
  experience: Array<{ role: string; company: string; dates: string; bullets: string[] }>
  education: Array<{ school: string; degree: string; dates: string }>
  projects: string[]
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Full name', email: 'Email', phone: 'Phone', location: 'Location', website: 'Website',
  linkedin: 'LinkedIn', github: 'GitHub', summary: 'Summary', skills: 'Skills',
}

export function Imports() {
  const [tab, setTab] = useState<'github' | 'linkedin'>('github')
  const [input, setInput] = useState('')
  const [source, setSource] = useState<ImportSource | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [title, setTitle] = useState('Imported Resume')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const runImport = async () => {
    if (!input.trim()) return
    setBusy(tab)
    setError('')
    try {
      const res = await api.post<{ source: ImportSource }>(`/import/${tab}`,
        tab === 'github' ? { username: input } : { text: input })
      setSource(res.source)
      setMapping({})
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy('')
    }
  }

  const toResume = async () => {
    setBusy('save')
    setError('')
    try {
      const res = await api.post<{ doc: ResumeDoc }>('/import/to-resume', {
        source: source as unknown as Record<string, unknown>,
        title,
      })
      navigate(`editor/${res.doc.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy('')
    }
  }

  const buildData = (src: ImportSource): ResumeData => {
    const exp: Section = {
      id: 'sec-exp', type: 'experience', title: 'Experience',
      items: (src.experience || []).map(x => `${x.role} — ${x.company}${x.dates ? ` (${x.dates})` : ''}${x.bullets.length ? `\n- ${x.bullets.join('\n- ')}` : ''}`),
    }
    const edu: Section = {
      id: 'sec-edu', type: 'education', title: 'Education',
      items: (src.education || []).map(x => `${x.school}${x.degree ? ` — ${x.degree}` : ''}${x.dates ? ` (${x.dates})` : ''}`),
    }
    return {
      sections: [exp, edu].filter(s => s.items.some(Boolean)),
      contact: {
        name: src.name || '', email: src.email || '', phone: src.phone || '',
        location: src.location || '', website: src.website || '', linkedin: src.linkedin || '', github: src.github || '',
      },
      summary: src.summary || '',
      skills: src.skills || [],
    }
  }

  return (
    <div className="page">
      <div className="page-head"><h2>Import</h2></div>
      {error && <div className="error-message">{error}</div>}
      <div className="toggle-group auth-tabs">
        <button className={`toggle-btn ${tab === 'github' ? 'active' : ''}`} onClick={() => setTab('github')}><Github size={14} /> GitHub</button>
        <button className={`toggle-btn ${tab === 'linkedin' ? 'active' : ''}`} onClick={() => setTab('linkedin')}><Linkedin size={14} /> LinkedIn</button>
      </div>

      <div className="card">
        {tab === 'github' ? (
          <div className="row">
            <input className="form-input" value={input} onChange={e => setInput(e.target.value)} placeholder="GitHub username" />
            <button className="btn" onClick={() => void runImport()} disabled={!!busy}>
              {busy === 'github' ? <Loader2 size={16} className="loader" /> : null} Fetch
            </button>
          </div>
        ) : (
          <>
            <textarea className="form-input form-textarea" rows={8} value={input} onChange={e => setInput(e.target.value)} placeholder="Paste a LinkedIn profile export (text)…" />
            <button className="btn" onClick={() => void runImport()} disabled={!!busy}>
              {busy === 'linkedin' ? <Loader2 size={16} className="loader" /> : null} Parse
            </button>
          </>
        )}
      </div>

      {source && (
        <div className="card">
          <h4>Import preview</h4>
          {Object.keys(FIELD_LABELS).filter(k => k !== 'skills' && (source as Record<string, unknown>)[k]).map(k => (
            <div key={k} className="comment-row">
              <span>{FIELD_LABELS[k]}</span>
              <input className="form-input" value={String((source as Record<string, unknown>)[k])}
                onChange={e => setSource({ ...source, [k]: e.target.value } as ImportSource)} />
            </div>
          ))}
          {source.skills.length > 0 && (
            <div className="comment-row">
              <span>Skills</span>
              <input className="form-input" value={source.skills.join(', ')}
                onChange={e => setSource({ ...source, skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            </div>
          )}
          <div className="comment-row">
            <span>Resume title</span>
            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <button className="btn" onClick={() => void toResume()} disabled={busy === 'save'}>
            {busy === 'save' ? <Loader2 size={16} className="loader" /> : null} Create resume
          </button>
        </div>
      )}
    </div>
  )
}
