export interface Section {
  id: string
  type: string
  title: string
  items: string[]
}

export interface ResumeData {
  contact: Record<string, string>
  summary: string
  skills: string[]
  sections: Section[]
}

export interface ResumeDoc {
  id: number
  title: string
  data: ResumeData
  template_id: number | null
  locale: string
  accent: string
  font: string
  visibility: string
  share_id: string | null
  version: number
  updated_at: string
}

export interface TemplateMeta {
  id: number | null
  name: string
  slug: string
  is_builtin: boolean
  key?: string
  description?: string
  rating?: number
  rating_count?: number
  downloads?: number
  tags?: string[]
}

export interface ScheduleEntry {
  id: number
  doc_id: number | null
  cron: string
  timezone: string
  email_to: string | null
  webhook_url: string | null
  next_run_at: string | null
  active: number
}

export interface ABTest {
  id: number
  name: string
  share_id: string
  url?: string
}

export function emptyData(): ResumeData {
  return {
    sections: [
      { id: 'sec-experience', type: 'experience', title: 'Experience', items: [''] },
      { id: 'sec-education', type: 'education', title: 'Education', items: [''] },
    ],
    contact: {},
    summary: '',
    skills: [],
  }
}

export class SDKError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message)
    this.name = 'SDKError'
  }
}

export interface SDKOptions {
  baseUrl?: string
  token?: string
  apiKey?: string
}

export class ResumeSDK {
  readonly baseUrl: string
  token?: string

  constructor(options: SDKOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.RESUME_API_URL || 'http://localhost:3000').replace(/\/$/, '')
    this.token = options.token || options.apiKey || undefined
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      let msg = `Request failed (${res.status})`
      let details: unknown
      try {
        const data = await res.json()
        if (data.error) msg = data.error
        details = data.details
      } catch { /* ignore */ }
      throw new SDKError(msg, res.status, details)
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) return (await res.json()) as T
    return (await res.text()) as unknown as T
  }

  get = <T>(path: string): Promise<T> => this.request<T>('GET', path)
  post = <T>(path: string, body?: unknown): Promise<T> => this.request<T>('POST', path, body)
  patch = <T>(path: string, body?: unknown): Promise<T> => this.request<T>('PATCH', path, body)
  put = <T>(path: string, body?: unknown): Promise<T> => this.request<T>('PUT', path, body)
  delete = <T>(path: string): Promise<T> => this.request<T>('DELETE', path)

  readonly auth = {
    login: async (email: string, password: string): Promise<{ token: string; user: unknown }> => {
      const res = await this.post<{ token: string; user: unknown }>('/auth/login', { email, password })
      this.token = res.token
      return res
    },
    register: async (email: string, password: string, username: string): Promise<{ token: string; user: unknown }> => {
      const res = await this.post<{ token: string; user: unknown }>('/auth/register', { email, password, username })
      this.token = res.token
      return res
    },
    me: () => this.get<{ user: unknown }>('/auth/me'),
  }

  readonly docs = {
    list: () => this.get<{ docs: ResumeDoc[] }>('/docs'),
    get: (id: number) => this.get<{ doc: ResumeDoc }>(`/docs/${id}`),
    create: (input: { title: string; data: ResumeData; template_key?: string; accent?: string; font?: string; visibility?: string }) =>
      this.post<{ doc: ResumeDoc }>('/docs', input),
    update: (id: number, patch: Partial<{ title: string; data: ResumeData; accent: string; font: string; template_id: number | null }>) =>
      this.patch<{ doc: ResumeDoc }>(`/docs/${id}`, patch),
    remove: (id: number) => this.delete<{ ok: true }>(`/docs/${id}`),
    versions: (id: number) => this.get<{ versions: Array<{ id: number; version: number; data: string; created_at: string }> }>(`/docs/${id}/versions`),
    restore: (id: number, version: number) => this.post<{ ok: true }>(`/docs/${id}/versions/${version}/restore`),
    share: (id: number, visibility = 'public') => this.post<{ share_id: string | null; url: string | null }>(`/docs/${id}/share?visibility=${visibility}`),
    validate: (id: number) => this.get<{ score: number; pass: boolean; issues: Array<{ severity: string; message: string }> }>(`/docs/${id}/validate`),
  }

  async export(docId: number, format: 'pdf' | 'html' | 'docx' | 'txt', outPath?: string): Promise<Buffer> {
    const res = await fetch(`${this.baseUrl}/api/v1/docs/${docId}/export?format=${format}`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    })
    if (!res.ok) throw new SDKError(`Export failed (${res.status})`, res.status)
    const buf = Buffer.from(await res.arrayBuffer())
    if (outPath) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(outPath, buf)
    }
    return buf
  }

  readonly marketplace = {
    list: (query?: string) => this.get<{ templates: TemplateMeta[] }>(`/marketplace${query ? `?query=${encodeURIComponent(query)}` : ''}`),
    get: (slug: string) => this.get<{ template: TemplateMeta }>(`/marketplace/${slug}`),
    create: (input: { name: string; description?: string; content_html: string; content_tex?: string; tags?: string[] }) =>
      this.post<{ template: TemplateMeta }>('/marketplace', input),
    rate: (slug: string, rating: number, comment?: string) => this.post<{ template: TemplateMeta | null }>(`/marketplace/${slug}/rate`, { rating, comment }),
    favorite: (slug: string) => this.post(`/marketplace/${slug}/favorite`),
    unfavorite: (slug: string) => this.delete(`/marketplace/${slug}/favorite`),
  }

  readonly teams = {
    list: () => this.get<{ teams: Array<{ id: number; name: string; description: string }> }>('/teams'),
    create: (name: string) => this.post<{ team: { id: number; name: string } }>('/teams', { name }),
    get: (id: number) => this.get<{ team: unknown; members: Array<{ id: number; username: string; role: string }> }>(`/teams/${id}`),
    addMember: (id: number, username: string, role = 'viewer') => this.post(`/teams/${id}/members`, { username, role }),
    setRole: (id: number, uid: number, role: string) => this.patch(`/teams/${id}/members/${uid}`, { role }),
    removeMember: (id: number, uid: number) => this.delete(`/teams/${id}/members/${uid}`),
  }

  readonly automation = {
    schedules: () => this.get<{ schedules: ScheduleEntry[] }>('/automation/schedules'),
    createSchedule: (input: { doc_id?: number | null; cron: string; timezone?: string; email_to?: string | null; webhook_url?: string | null }) =>
      this.post<{ schedule: ScheduleEntry }>('/automation/schedules', input),
    deleteSchedule: (id: number) => this.delete(`/automation/schedules/${id}`),
    runSchedule: (id: number) => this.post(`/automation/schedules/${id}/run`),
    nextRun: (cron: string) => this.get<{ next: string }>(`/automation/schedules/next?cron=${encodeURIComponent(cron)}`),
    webhooks: () => this.get<{ webhooks: Array<{ id: number; name: string; url: string; events: string[] }> }>('/automation/webhooks'),
    createWebhook: (input: { name: string; url: string; secret?: string; events?: string[] }) =>
      this.post<{ webhook: unknown }>('/automation/webhooks', input),
    deleteWebhook: (id: number) => this.delete(`/automation/webhooks/${id}`),
  }

  readonly ai = {
    bullets: (role: string, existing?: string[]) => this.post<{ bullets: string[] }>('/ai/suggest-bullets', { role, existing }),
    rewrite: (text: string, tone: 'formal' | 'concise' | 'action' | 'friendly') => this.post<{ bullet: string }>('/ai/rewrite', { text, tone }),
    summary: (role: string, skills?: string[]) => this.post<{ summary: string }>('/ai/summary', { role, skills }),
  }

  readonly import_ = {
    github: (username: string) => this.post<{ source: unknown }>('/import/github', { username }),
    linkedin: (text: string) => this.post<{ source: unknown }>('/import/linkedin', { text }),
    toResume: (source: unknown, title?: string) => this.post<{ data: ResumeData; doc?: ResumeDoc }>('/import/to-resume', { source, title }),
  }

  readonly analytics = {
    abTests: () => this.get<{ tests: ABTest[] }>('/analytics/ab-tests'),
    createABTest: (name: string, docIds: number[]) => this.post<{ test: ABTest; url: string }>('/analytics/ab-tests', { name, doc_ids: docIds }),
    abTest: (id: number) => this.get<{ test: ABTest }>(`/analytics/ab-tests/${id}`),
    docStats: (id: number) => this.get<{ stats: { views: number; downloads: number } }>(`/analytics/doc/${id}`),
  }

  readonly apiKeys = {
    list: () => this.get<{ keys: Array<{ id: number; name: string; prefix: string }> }>('/api-keys'),
    create: (name: string) => this.post<{ key: { id: number; name: string; prefix: string; key: string } }>('/api-keys', { name }),
    revoke: (id: number) => this.delete(`/api-keys/${id}`),
  }

  readonly i18n = {
    langs: () => this.get<{ langs: string[] }>('/i18n/langs'),
    get: (lang: string) => this.get<{ lang: string; translations: Record<string, string> }>(`/i18n/${lang}`),
    put: (lang: string, translations: Record<string, string>) => this.put(`/i18n/`, { lang, translations }),
  }
}
