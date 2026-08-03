import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, KeyRound, Loader2, Play, Plus, Trash2, Webhook } from 'lucide-react'
import { api, type ResumeDoc, type ScheduleEntry, type WebhookEntry } from '../lib/api'

export function Schedules() {
  const [docs, setDocs] = useState<ResumeDoc[]>([])
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([])
  const [keys, setKeys] = useState<{ id: number; name: string; prefix: string; created_at: string }[]>([])
  const [newKey, setNewKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [d, s, w, k] = await Promise.all([
        api.get<{ docs: ResumeDoc[] }>('/docs'),
        api.get<{ schedules: ScheduleEntry[] }>('/automation/schedules'),
        api.get<{ webhooks: WebhookEntry[] }>('/automation/webhooks'),
        api.get<{ keys: { id: number; name: string; prefix: string; created_at: string }[] }>('/api-keys'),
      ])
      setDocs(d.docs)
      setSchedules(s.schedules)
      setWebhooks(w.webhooks)
      setKeys(k.keys)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load automation')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = new FormData(e.target as HTMLFormElement)
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ schedule: ScheduleEntry }>('/automation/schedules', {
        doc_id: form.get('doc_id') ? Number(form.get('doc_id')) : null,
        cron: String(form.get('cron')),
        email_to: (form.get('email_to') as string) || null,
        webhook_url: (form.get('webhook_url') as string) || null,
      })
      setSchedules(s => [...s, res.schedule])
      ;(e.target as HTMLFormElement).reset()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Schedule failed')
    } finally {
      setBusy(false)
    }
  }

  const deleteSchedule = async (id: number) => {
    try {
      await api.delete(`/automation/schedules/${id}`)
      setSchedules(s => s.filter(x => x.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const runSchedule = async (id: number) => {
    try {
      await api.post(`/automation/schedules/${id}/run`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Run failed')
    }
  }

  const addWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = new FormData(e.target as HTMLFormElement)
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ webhook: WebhookEntry }>('/automation/webhooks', {
        name: String(form.get('name')),
        url: String(form.get('url')),
        secret: (form.get('secret') as string) || undefined,
        events: (form.get('events') as string).split(',').map(s => s.trim()).filter(Boolean),
      })
      setWebhooks(w => [...w, res.webhook])
      ;(e.target as HTMLFormElement).reset()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Webhook failed')
    } finally {
      setBusy(false)
    }
  }

  const deleteWebhook = async (id: number) => {
    try {
      await api.delete(`/automation/webhooks/${id}`)
      setWebhooks(w => w.filter(x => x.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const createKey = async () => {
    if (!newKey.trim()) return
    try {
      const res = await api.post<{ key: { id: number; name: string; prefix: string; created_at: string; key: string } }>('/api-keys', { name: newKey })
      const { key, ...rest } = res.key
      setKeys(ks => [...ks, rest])
      setNewKey('')
      window.alert(`API key created (shown once):\n${key}\n\nStore it now.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Key creation failed')
    }
  }

  const deleteKey = async (id: number) => {
    try {
      await api.delete(`/api-keys/${id}`)
      setKeys(ks => ks.filter(k => k.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Key deletion failed')
    }
  }

  return (
    <div className="page">
      <div className="page-head"><h2>Automation</h2></div>
      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <h4><CalendarClock size={16} /> Schedules</h4>
        <form onSubmit={addSchedule} className="form-grid">
          <select name="doc_id" className="form-select">
            <option value="">Any resume</option>
            {docs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <input name="cron" className="form-input" placeholder="cron e.g. 0 9 * * 1" required />
          <input name="email_to" type="email" className="form-input" placeholder="email_to (optional)" />
          <input name="webhook_url" className="form-input" placeholder="webhook_url (optional)" />
          <button className="btn" disabled={busy}>{busy ? <Loader2 size={16} className="loader" /> : <Plus size={16} />} Add</button>
        </form>
        {schedules.map(s => (
          <div key={s.id} className="comment-row">
            <span><strong>{s.cron}</strong> — next {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : 'n/a'}</span>
            <span className="muted">{s.email_to || 'no email'} {s.webhook_url ? '• webhook' : ''}</span>
            <button className="btn btn-small" onClick={() => void runSchedule(s.id)} title="Run now"><Play size={14} /></button>
            <button className="btn-icon-only" onClick={() => void deleteSchedule(s.id)}><Trash2 size={14} /></button>
          </div>
        ))}
        {schedules.length === 0 && <p className="muted">No schedules yet.</p>}
      </div>

      <div className="card">
        <h4><Webhook size={16} /> Webhooks</h4>
        <form onSubmit={addWebhook} className="form-grid">
          <input name="name" className="form-input" placeholder="name" required />
          <input name="url" type="url" className="form-input" placeholder="https://example.com/hook" required />
          <input name="secret" className="form-input" placeholder="secret (optional)" />
          <input name="events" className="form-input" placeholder="events e.g. doc.export, doc.share" />
          <button className="btn" disabled={busy}>{busy ? <Loader2 size={16} className="loader" /> : <Plus size={16} />} Add</button>
        </form>
        {webhooks.map(w => (
          <div key={w.id} className="comment-row">
            <span><strong>{w.name}</strong> — {w.url}</span>
            <span className="muted">{(w.events || []).join(', ')}</span>
            <button className="btn-icon-only" onClick={() => void deleteWebhook(w.id)}><Trash2 size={14} /></button>
          </div>
        ))}
        {webhooks.length === 0 && <p className="muted">No webhooks yet.</p>}
      </div>

      <div className="card">
        <h4><KeyRound size={16} /> API Keys</h4>
        <div className="row">
          <input className="form-input" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="key name" />
          <button className="btn" onClick={() => void createKey()} disabled={!newKey.trim()}><Plus size={16} /> Create</button>
        </div>
        {keys.map(k => (
          <div key={k.id} className="comment-row">
            <span><strong>{k.name}</strong> — {k.prefix}…</span>
            <span className="muted">{new Date(k.created_at).toLocaleDateString()}</span>
            <button className="btn-icon-only" onClick={() => void deleteKey(k.id)}><Trash2 size={14} /></button>
          </div>
        ))}
        {keys.length === 0 && <p className="muted">No API keys yet.</p>}
      </div>
    </div>
  )
}
