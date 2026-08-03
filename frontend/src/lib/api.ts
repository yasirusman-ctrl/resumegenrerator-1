const API_URL = import.meta.env.VITE_API_URL || '/api/v1'
const TOKEN_KEY = 'rg_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export interface ApiError extends Error {
  status: number
  details?: Record<string, unknown>
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string> | undefined) }
  if (opts.body && typeof opts.body === 'string' && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    let details: Record<string, unknown> | undefined
    try {
      const data = await res.json()
      if (data.error) msg = data.error
      if (data.details) details = data.details
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(msg) as ApiError
    err.status = res.status
    err.details = details
    throw err
  }
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

function json(method: string) {
  return <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
  post: json('POST'),
  patch: json('PATCH'),
  put: json('PUT'),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
  raw: request,
}

export interface User {
  id: number
  email: string
  username: string
  name: string | null
  bio: string | null
  role: string
  avatar: string | null
}

export interface Section {
  id: string
  type: string
  title: string
  items: string[]
}

export interface ResumeData {
  sections: Section[]
  contact: Record<string, string>
  summary: string
  skills: string[]
}

export interface ResumeDoc {
  id: number
  user_id: number
  title: string
  data: ResumeData
  template_id: number | null
  locale: string
  accent: string
  font: string
  visibility: string
  share_id: string | null
  version: number
  team_id: number | null
  created_at: string
  updated_at: string
}

export interface TemplateMeta {
  id: number | null
  name: string
  slug: string
  is_builtin: boolean
  key?: string
  description?: string
  author_id?: number | null
  language?: string
  tags?: string[]
  downloads?: number
  status?: string
  rating?: number
  rating_count?: number
  variables?: Array<{ key: string; label?: string; type?: string; default?: string }>
}

export interface VersionEntry {
  id: number
  doc_id: number
  version: number
  data: string
  created_at: string
}

export interface CommentEntry {
  id: number
  doc_id: number
  user_id: number
  body: string
  resolved: number
  username?: string
  created_at: string
}

export interface ScheduleEntry {
  id: number
  user_id: number
  doc_id: number | null
  cron: string
  timezone: string
  email_to: string | null
  webhook_url: string | null
  next_run_at: string | null
  last_run_at: string | null
  active: number
  created_at: string
}

export interface WebhookEntry {
  id: number
  user_id: number
  name: string
  url: string
  secret: string | null
  events: string[]
  created_at: string
}

export interface Team {
  id: number
  owner_id: number
  name: string
  description: string
  created_at: string
}

export interface TeamMember {
  id: number
  username: string
  role: string
}

export interface ABTest {
  id: number
  share_id: string
  doc_ids: string
  variants?: Array<{ docId: number; title: string; views?: number; downloads?: number; [k: string]: unknown }>
  url?: string
}

export const emptyData = (): ResumeData => ({
  sections: [
    { id: 'sec-experience', type: 'experience', title: 'Experience', items: [''] },
    { id: 'sec-education', type: 'education', title: 'Education', items: [''] },
  ],
  contact: {},
  summary: '',
  skills: [],
})
