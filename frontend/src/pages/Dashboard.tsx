import { useCallback, useEffect, useState } from 'react'
import { FileText, Plus, Share2, Trash2, Loader2 } from 'lucide-react'
import { api, emptyData, type ResumeDoc } from '../lib/api'
import { navigate } from '../lib/router'

export function Dashboard() {
  const [docs, setDocs] = useState<ResumeDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('Untitled resume')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ docs: ResumeDoc[] }>('/docs')
      setDocs(res.docs)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load resumes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async () => {
    setCreating(true)
    setError('')
    try {
      const res = await api.post<{ doc: ResumeDoc }>('/docs', { title, data: emptyData(), template_key: 'modern', accent: 'blue', font: 'inter' })
      navigate(`editor/${res.doc.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create resume')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm('Delete this resume?')) return
    try {
      await api.delete(`/docs/${id}`)
      setDocs(ds => ds.filter(d => d.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>My Resumes</h2>
        <div className="row">
          <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Resume title" />
          <button className="btn" onClick={() => void create()} disabled={creating}>
            {creating ? <Loader2 size={16} className="loader" /> : <Plus size={16} />} New
          </button>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}
      {loading ? (
        <div className="muted">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="card"><p className="muted">No resumes yet. Create one to get started.</p></div>
      ) : (
        <div className="doc-grid">
          {docs.map(doc => (
            <div key={doc.id} className="card doc-card" onClick={() => navigate(`editor/${doc.id}`)}>
              <div className="doc-card-head">
                <FileText size={18} />
                <span className="doc-title">{doc.title}</span>
              </div>
              <div className="doc-meta">
                <span>v{doc.version}</span>
                <span>{doc.visibility}</span>
                <span>{new Date(doc.updated_at).toLocaleDateString()}</span>
              </div>
              <div className="doc-actions">
                <span className="btn btn-small" onClick={e => { e.stopPropagation(); navigate(`editor/${doc.id}`) }}>Edit</span>
                {doc.share_id && (
                  <a className="btn btn-small btn-secondary" target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    href={`${import.meta.env.VITE_API_URL || '/api/v1'}/share/${doc.share_id}`}>
                    <Share2 size={14} /> Share
                  </a>
                )}
                <span className="btn btn-small btn-danger" onClick={e => { e.stopPropagation(); void remove(doc.id) }}>
                  <Trash2 size={14} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
