import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, GitCompare } from 'lucide-react'
import { api, type ResumeDoc, type ABTest } from '../lib/api'

export function Analytics() {
  const [docs, setDocs] = useState<ResumeDoc[]>([])
  const [tests, setTests] = useState<ABTest[]>([])
  const [selected, setSelected] = useState<ABTest | null>(null)
  const [docStats, setDocStats] = useState<Record<number, { views: number; downloads: number }>>({})
  const [name, setName] = useState('')
  const [pick, setPick] = useState<number[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([
        api.get<{ docs: ResumeDoc[] }>('/docs'),
        api.get<{ tests: ABTest[] }>('/analytics/ab-tests'),
      ])
      setDocs(d.docs)
      setTests(t.tests)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const loadDocStats = useCallback(async () => {
    const out: Record<number, { views: number; downloads: number }> = {}
    for (const doc of docs) {
      try {
        const res = await api.get<{ stats: { views: number; downloads: number } }>(`/analytics/doc/${doc.id}`)
        out[doc.id] = res.stats
      } catch { /* ignore */ }
    }
    setDocStats(out)
  }, [docs])

  useEffect(() => { void loadDocStats() }, [loadDocStats])

  const createTest = async () => {
    if (pick.length < 2 || !name.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ test: ABTest; url: string }>('/analytics/ab-tests', { name, doc_ids: pick })
      setTests(ts => [...ts, { ...res.test, url: res.url }])
      setName('')
      setPick([])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'A/B create failed')
    } finally {
      setBusy(false)
    }
  }

  const openTest = async (id: number) => {
    try {
      const res = await api.get<{ test: ABTest }>(`/analytics/ab-tests/${id}`)
      setSelected(res.test)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Load test failed')
    }
  }

  const togglePick = (id: number) => setPick(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))

  return (
    <div className="page">
      <div className="page-head"><h2><GitCompare size={20} /> Analytics</h2></div>
      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <h4>Resume views & downloads</h4>
        {docs.map(d => (
          <div key={d.id} className="comment-row">
            <span>{d.title}</span>
            <span className="muted">{docStats[d.id]?.views ?? 0} views · {docStats[d.id]?.downloads ?? 0} downloads</span>
          </div>
        ))}
        {docs.length === 0 && <p className="muted">No resumes yet.</p>}
      </div>

      <div className="card">
        <h4>A/B tests</h4>
        <div className="row">
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Test name" />
          <select className="form-select" multiple size={4} value={pick}
            onChange={e => setPick(Array.from(e.target.selectedOptions).map(o => Number(o.value)))}>
            {docs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <button className="btn" onClick={() => void createTest()} disabled={busy || pick.length < 2 || !name.trim()}>
            {busy ? <Loader2 size={16} className="loader" /> : <Plus size={16} />} Create test
          </button>
        </div>
        {tests.map(t => {
          let count = 0
          try { count = JSON.parse(t.doc_ids as unknown as string).length } catch { count = 0 }
          return (
            <div key={t.id} className="comment-row">
              <span><strong>{t.name}</strong> — {count} variants</span>
              <button className="btn btn-small" onClick={() => void openTest(t.id)}>View</button>
            </div>
          )
        })}
        {tests.length === 0 && <p className="muted">No A/B tests yet.</p>}
      </div>

      {selected && (
        <div className="card">
          <h4>{selected.name}</h4>
          {selected.url && (
            <div className="share-link">
              <input readOnly value={`${window.location.origin}${import.meta.env.VITE_API_URL || '/api/v1'}${selected.url}`}
                onClick={e => (e.target as HTMLInputElement).select()} />
            </div>
          )}
          {(selected.variants || []).map(v => (
            <div key={v.docId} className="comment-row">
              <span>{v.title}</span>
              <span className="muted">{v.views ?? 0} views · {v.downloads ?? 0} downloads</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
