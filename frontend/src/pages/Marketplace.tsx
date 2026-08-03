import { useCallback, useEffect, useState } from 'react'
import { Heart, Loader2, Plus, Star, Download } from 'lucide-react'
import { api, type TemplateMeta } from '../lib/api'
import { useAuth } from '../lib/auth'

export function Marketplace() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [upload, setUpload] = useState({ name: '', description: '', content_html: '', content_tex: '', tags: '' })
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ templates: TemplateMeta[] }>(`/marketplace${query ? `?query=${encodeURIComponent(query)}` : ''}`)
      setTemplates(res.templates)
      if (user) {
        const fav = await api.get<{ templates: TemplateMeta[] }>('/marketplace/favorites').catch(() => ({ templates: [] }))
        setFavorites(fav.templates.map(t => t.slug))
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace')
    }
  }, [query, user])

  useEffect(() => {
    const t = setTimeout(() => void load(), 300)
    return () => clearTimeout(t)
  }, [load])

  const toggleFavorite = async (slug: string) => {
    if (!user) return
    const isFav = favorites.includes(slug)
    try {
      await (isFav ? api.delete(`/marketplace/${slug}/favorite`) : api.post(`/marketplace/${slug}/favorite`))
      setFavorites(fs => isFav ? fs.filter(s => s !== slug) : [...fs, slug])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Favorite failed')
    }
  }

  const rate = async (slug: string, rating: number) => {
    if (!user) return
    try {
      const res = await api.post<{ template: TemplateMeta | null }>(`/marketplace/${slug}/rate`, { rating })
      if (res.template) setTemplates(ts => ts.map(t => (t.slug === slug ? res.template! : t)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rating failed')
    }
  }

  const submitTemplate = async () => {
    setBusy('upload')
    setError('')
    try {
      const res = await api.post<{ template: TemplateMeta }>('/marketplace', {
        name: upload.name,
        description: upload.description,
        content_html: upload.content_html,
        content_tex: upload.content_tex || undefined,
        tags: upload.tags.split(',').map(s => s.trim()).filter(Boolean),
      })
      setTemplates(ts => [res.template, ...ts])
      setShowUpload(false)
      setUpload({ name: '', description: '', content_html: '', content_tex: '', tags: '' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Template Marketplace</h2>
        <div className="row">
          <input className="form-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search templates…" />
          {user && <button className="btn" onClick={() => setShowUpload(s => !s)}><Plus size={16} /> Upload</button>}
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}

      {showUpload && (
        <div className="card">
          <h4>Upload a template</h4>
          <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={upload.name} onChange={e => setUpload({ ...upload, name: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Description</label><input className="form-input" value={upload.description} onChange={e => setUpload({ ...upload, description: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">HTML template ({"{{ var }}"}) syntax</label><textarea className="form-input form-textarea" value={upload.content_html} onChange={e => setUpload({ ...upload, content_html: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">LaTeX template (optional)</label><textarea className="form-input form-textarea" rows={4} value={upload.content_tex} onChange={e => setUpload({ ...upload, content_tex: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Tags (comma separated)</label><input className="form-input" value={upload.tags} onChange={e => setUpload({ ...upload, tags: e.target.value })} /></div>
          <button className="btn" onClick={() => void submitTemplate()} disabled={busy === 'upload' || !upload.name || !upload.content_html}>
            {busy === 'upload' ? <Loader2 size={16} className="loader" /> : null} Publish template
          </button>
        </div>
      )}

      <div className="doc-grid">
        {templates.map(t => (
          <div key={t.slug} className="card doc-card">
            <div className="doc-card-head">
              <span className="doc-title">{t.name}</span>
              <span className="muted">{(t.rating || 0).toFixed(1)} <Star size={12} /></span>
            </div>
            <p className="muted template-desc">{t.description}</p>
            <div className="doc-meta">
              <span>{t.downloads || 0} downloads</span>
              <span>{(t.tags || []).slice(0, 3).join(', ')}</span>
            </div>
            <div className="doc-actions">
              <span className="btn btn-small btn-secondary" onClick={() => window.open(`${import.meta.env.VITE_API_URL || '/api/v1'}/share`, '_blank')} style={{ display: 'none' }}>
                <Download size={14} />
              </span>
              {[1, 2, 3, 4, 5].map(r => (
                <button key={r} className={`star-btn ${(t.rating || 0) >= r ? 'on' : ''}`} onClick={() => void rate(t.slug, r)} disabled={!user} title={`Rate ${r}`}>
                  <Star size={12} />
                </button>
              ))}
              {user && (
                <span className={`btn btn-small ${favorites.includes(t.slug) ? 'btn-active' : 'btn-secondary'}`} onClick={() => void toggleFavorite(t.slug)}>
                  <Heart size={14} /> {favorites.includes(t.slug) ? 'Faved' : 'Favorite'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {templates.length === 0 && !error && <div className="card"><p className="muted">No templates found.</p></div>}
    </div>
  )
}
