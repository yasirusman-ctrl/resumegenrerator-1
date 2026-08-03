import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, Download, GripVertical, Loader2, Plus, Share2, Trash2, Wand2, X } from 'lucide-react'
import { api, emptyData, type ResumeData, type ResumeDoc, type TemplateMeta, type Section, type VersionEntry, type CommentEntry } from '../lib/api'
import { navigate } from '../lib/router'

const ACCENTS = ['blue', 'green', 'red', 'purple', 'orange', 'teal', 'pink', 'gray']
const FONTS = ['inter', 'outfit', 'roboto', 'mono', 'serif']
const TONES = ['formal', 'concise', 'action', 'friendly']

let secCounter = 0
function newSection(type = 'custom', title = ''): Section {
  return { id: `sec-${++secCounter}`, type, title, items: [''] }
}

export function Editor({ docId }: { docId: number }) {
  const [doc, setDoc] = useState<ResumeDoc | null>(null)
  const [data, setData] = useState<ResumeData>(emptyData())
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [accent, setAccent] = useState('blue')
  const [font, setFont] = useState('inter')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState('')
  const [tab, setTab] = useState<'edit' | 'ai' | 'versions' | 'comments'>('edit')
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [validation, setValidation] = useState<{ score: number; pass: boolean; issues: Array<{ severity: string; category: string; message: string }> } | null>(null)
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [comments, setComments] = useState<CommentEntry[]>([])
  const [commentText, setCommentText] = useState('')
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ doc: ResumeDoc }>(`/docs/${docId}`)
      setDoc(res.doc)
      setData(res.doc.data)
      setAccent(res.doc.accent || 'blue')
      setFont(res.doc.font || 'inter')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load resume')
      navigate('dashboard')
    }
  }, [docId])

  useEffect(() => { void load() }, [load])

  const loadTemplates = useCallback(async () => {
    try {
      const [builtin, market] = await Promise.all([
        api.get<{ templates: TemplateMeta[] }>('/editor/templates'),
        api.get<{ templates: TemplateMeta[] }>('/marketplace').catch(() => ({ templates: [] })),
      ])
      setTemplates([...builtin.templates, ...market.templates])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void loadTemplates() }, [loadTemplates])

  const update = (next: ResumeData) => {
    setData(next)
    setDirty(true)
  }

  useEffect(() => {
    if (!dirty || !data) return
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await api.post<{ html: string }>('/editor/preview', {
          data,
          template_id: doc?.template_id ?? null,
          template_key: doc?.template_id ? undefined : 'modern',
          accent,
          font,
          locale: doc?.locale || 'en',
        })
        setPreview(res.html)
      } catch { /* preview errors are non-fatal */ }
    }, 500)
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current) }
  }, [data, accent, font, dirty, doc])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await api.patch<{ doc: ResumeDoc }>(`/docs/${docId}`, { data, accent, font, template_id: doc?.template_id ?? null })
      setDoc(res.doc)
      setDirty(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const exportResume = async (format: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/docs/${docId}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rg_token') || ''}` },
      })
      if (!res.ok) throw new Error(`Export ${format} failed`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${doc?.title || 'resume'}.${format === 'docx' ? 'docx' : format}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const share = async () => {
    try {
      const res = await api.post<{ url: string | null }>(`/docs/${docId}/share?visibility=public`)
      setShareUrl(res.url ? `${window.location.origin}${import.meta.env.VITE_API_URL || '/api/v1'}${res.url}` : '')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Share failed')
    }
  }

  const validate = async () => {
    try {
      const res = await api.get<{ score: number; pass: boolean; issues: Array<{ severity: string; category: string; message: string }> }>(`/docs/${docId}/validate`)
      setValidation(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Validation failed')
    }
  }

  const loadVersions = async () => {
    try {
      const res = await api.get<{ versions: VersionEntry[] }>(`/docs/${docId}/versions`)
      setVersions(res.versions)
    } catch { /* ignore */ }
  }

  const restoreVersion = async (version: number) => {
    try {
      await api.post(`/docs/${docId}/versions/${version}/restore`)
      await load()
      setVersions(await api.get<{ versions: VersionEntry[] }>(`/docs/${docId}/versions`).then(r => r.versions))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Restore failed')
    }
  }

  const loadComments = async () => {
    try {
      const res = await api.get<{ comments: CommentEntry[] }>(`/docs/${docId}/comments`)
      setComments(res.comments)
    } catch { /* ignore */ }
  }

  const addComment = async () => {
    if (!commentText.trim()) return
    try {
      await api.post(`/docs/${docId}/comments`, { body: commentText })
      setCommentText('')
      await loadComments()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Comment failed')
    }
  }

  const resolveComment = async (cid: number) => {
    try {
      await api.post(`/docs/${docId}/comments/${cid}/resolve`)
      await loadComments()
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (tab === 'versions') void loadVersions()
    if (tab === 'comments') void loadComments()
  }, [tab])

  const reorder = (from: number, to: number) => {
    if (from === null || to === null || from === to) return
    const arr = [...data.sections]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    update({ ...data, sections: arr })
  }

  const patchContact = (key: string, value: string) => update({ ...data, contact: { ...data.contact, [key]: value } })
  const patchSection = (id: string, field: 'title' | 'items', value: string | string[]) =>
    update({ ...data, sections: data.sections.map(s => (s.id === id ? { ...s, [field]: value } : s)) })

  const ContactFields = ['name', 'title', 'email', 'phone', 'location', 'website', 'linkedin', 'github', 'languages'] as const

  return (
    <div className="editor-page">
      <div className="editor-sidebar">
        <div className="page-head">
          <h2>{doc?.title || 'Editor'}</h2>
          <button className="btn btn-small" onClick={() => navigate('dashboard')} title="Back">←</button>
        </div>
        {error && <div className="error-message">{error}</div>}

        <div className="editor-tabs">
          {(['edit', 'ai', 'versions', 'comments'] as const).map(t => (
            <button key={t} className={`toggle-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'edit' && (
          <div className="edit-pane">
            <div className="form-group">
              <label className="form-label">Template</label>
              <select className="form-select" value={doc?.template_id ?? -1}
                onChange={e => { const v = e.target.value === '-1' ? null : Number(e.target.value); setDoc(d => d ? { ...d, template_id: v } : d); setDirty(true) }}>
                <option value={-1}>modern (built-in)</option>
                {templates.filter(t => t.id !== null).map(t => (
                  <option key={t.slug} value={t.id ?? undefined}>{t.name} {t.is_builtin ? '(built-in)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Accent</label>
                <div className="color-picker">
                  {ACCENTS.map(c => (
                    <button key={c} type="button" className={`color-swatch ${c} ${accent === c ? 'selected' : ''}`} onClick={() => { setAccent(c); setDirty(true) }} />
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Font</label>
                <select className="form-select" value={font} onChange={e => { setFont(e.target.value); setDirty(true) }}>
                  {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <div className="card">
              <h4>Contact</h4>
              <div className="contact-grid">
                {ContactFields.map(f => (
                  <input key={f} className="form-input" placeholder={f} value={data.contact[f] || ''} onChange={e => patchContact(f, e.target.value)} />
                ))}
              </div>
            </div>

            <div className="card">
              <h4>Summary</h4>
              <textarea className="form-input form-textarea" value={data.summary} onChange={e => update({ ...data, summary: e.target.value })} />
            </div>

            <div className="card">
              <h4>Skills</h4>
              <textarea className="form-input form-textarea" rows={2} value={data.skills.join(', ')}
                onChange={e => update({ ...data, skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            </div>

            <div className="card">
              <h4>Sections <span className="btn btn-small" onClick={() => update({ ...data, sections: [...data.sections, newSection()] })}><Plus size={14} /> Add</span></h4>
              {data.sections.map((sec, si) => (
                <div key={sec.id} className="section-card" draggable
                  onDragStart={() => setDragFrom(si)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { reorder(dragFrom!, si); setDragFrom(null) }}>
                  <div className="section-header">
                    <span className="drag-handle"><GripVertical size={14} /></span>
                    <input className="form-input" value={sec.title} placeholder="Section title"
                      onChange={e => patchSection(sec.id, 'title', e.target.value)} />
                    <button type="button" className="btn-icon-only" onClick={() => update({ ...data, sections: data.sections.filter(s => s.id !== sec.id) })}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {sec.items.map((it, ii) => (
                    <div key={ii} className="section-item-row">
                      <input className="form-input section-item" value={it} onChange={e => {
                        const items = [...sec.items]; items[ii] = e.target.value
                        patchSection(sec.id, 'items', items)
                      }} />
                      <button type="button" className="btn-icon-only" onClick={() => patchSection(sec.id, 'items', sec.items.filter((_, j) => j !== ii))}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <span className="btn btn-small" onClick={() => patchSection(sec.id, 'items', [...sec.items, ''])}>
                    <Plus size={14} /> Item
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'ai' && <AIPanel data={data} update={update} onError={setError} />}

        {tab === 'versions' && (
          <div className="card">
            <h4>Versions</h4>
            {versions.map(v => (
              <div key={v.id} className="version-row">
                <span>v{v.version}</span>
                <span className="muted">{new Date(v.created_at).toLocaleString()}</span>
                <span className="btn btn-small" onClick={() => void restoreVersion(v.version)}>Restore</span>
              </div>
            ))}
            {versions.length === 0 && <p className="muted">No versions yet. Save to create one.</p>}
          </div>
        )}

        {tab === 'comments' && (
          <div className="card">
            <h4>Comments</h4>
            <div className="row">
              <input className="form-input" value={commentText} placeholder="Add a comment…" onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void addComment() }} />
              <button className="btn btn-small" onClick={() => void addComment()}>Add</button>
            </div>
            {comments.map(c => (
              <div key={c.id} className="comment-row">
                <span className="comment-body">{c.body}</span>
                <span className="muted">{c.username || `user#${c.user_id}`}</span>
                {!c.resolved && <button className="btn btn-small" onClick={() => void resolveComment(c.id)}>Resolve</button>}
              </div>
            ))}
            {comments.length === 0 && <p className="muted">No comments.</p>}
          </div>
        )}

        <div className="editor-actions">
          <button className="btn" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <Loader2 size={16} className="loader" /> : null} Save{dirty ? '*' : ''}
          </button>
          <button className="btn btn-secondary" onClick={() => void share()}>Share</button>
          {shareUrl && <div className="share-link"><input readOnly value={shareUrl} onClick={e => (e.target as HTMLInputElement).select()} /></div>}
          <div className="row export-row">
            {['pdf', 'html', 'docx', 'txt'].map(f => (
              <button key={f} className="btn btn-small btn-secondary" onClick={() => void exportResume(f)}>
                <Download size={14} /> {f.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={() => void validate()}>Validate</button>
          {validation && (
            <div className={`validation-box ${validation.pass ? 'ok' : ''}`}>
              <strong>Score: {validation.score}/100</strong>
              {validation.issues.map((iss, i) => (
                <div key={i} className={`issue-${iss.severity}`}><AlertCircle size={12} /> {iss.message}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="editor-preview">
        {preview ? <iframe title="preview" srcDoc={preview} className="preview-frame" /> : <div className="muted preview-empty">Waiting for content…</div>}
      </div>
    </div>
  )
}

function AIPanel({ data, update, onError }: { data: ResumeData; update: (d: ResumeData) => void; onError: (m: string) => void }) {
  const [role, setRole] = useState('')
  const [tone, setTone] = useState<string>('formal')
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState<string[]>([])

  const call = async (path: string, body: unknown) => {
    setBusy(path)
    setResult([])
    try {
      const res = await api.post<Record<string, unknown>>(`/ai/${path}`, body)
      setResult(path === 'suggest-bullets' || path === 'skills' ? (res[path === 'skills' ? 'skills' : 'bullets'] as string[]) : [res.bullet as string || res.summary as string || ''])
      return res
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'AI request failed')
      return null
    } finally {
      setBusy('')
    }
  }

  const useFirstBullet = () => {
    if (!result[0]) return
    const sec = data.sections[0]
    if (sec) update({ ...data, sections: data.sections.map((s, i) => i === 0 ? { ...s, items: [result[0], ...s.items.filter(x => x)] } : s) })
    else update({ ...data, sections: [{ id: 'sec-ai', type: 'custom', title: 'Highlights', items: result }] })
  }

  return (
    <div className="card ai-pane">
      <h4><Wand2 size={14} /> AI Writing Assistant</h4>
      <div className="form-group">
        <label className="form-label">Target role</label>
        <input className="form-input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g., Product Manager" />
      </div>
      <div className="row">
        <span className="btn btn-small" onClick={() => void call('suggest-bullets', { role, existing: data.sections.flatMap(s => s.items) })} disabled={!!busy || !role.trim()}>
          {busy === 'suggest-bullets' ? <Loader2 size={14} className="loader" /> : null} Bullets
        </span>
        <span className="btn btn-small" onClick={() => void call('summary', { role, skills: data.skills })} disabled={!!busy || !role.trim()}>
          {busy === 'summary' ? <Loader2 size={14} className="loader" /> : null} Summary
        </span>
        <span className="btn btn-small" onClick={() => void call('skills', { role })} disabled={!!busy || !role.trim()}>
          {busy === 'skills' ? <Loader2 size={14} className="loader" /> : null} Skills
        </span>
      </div>
      <div className="row">
        <select className="form-select" value={tone} onChange={e => setTone(e.target.value)}>
          {TONES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="btn btn-small" onClick={() => void call('rewrite', { text: data.summary || data.sections[0]?.items[0] || '', tone })} disabled={!!busy}>
          {busy === 'rewrite' ? <Loader2 size={14} className="loader" /> : null} Rewrite
        </span>
      </div>
      {result.length > 0 && (
        <div className="ai-results">
          {result.map((r, i) => (
            <div key={i} className="ai-result-row">
              <span>{r}</span>
              {i === 0 && <button className="btn btn-small" onClick={useFirstBullet}>Use</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
