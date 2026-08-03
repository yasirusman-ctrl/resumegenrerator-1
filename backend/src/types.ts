export interface UserRow {
  id: number
  email: string
  username: string
  name: string | null
  bio: string | null
  password_hash: string
  role: string
  avatar: string | null
  created_at: string
  updated_at: string
}

export interface DocRow {
  id: number
  user_id: number | null
  title: string
  slug: string
  data: string
  template_id: number | null
  template_key: string
  locale: string
  accent: string
  font: string
  version: number
  visibility: string
  share_id: string | null
  team_id: number | null
  language: string
  created_at: string
  updated_at: string
}

export interface TemplateRow {
  id: number
  name: string
  slug: string
  description: string | null
  author_id: number | null
  content_tex: string
  content_html: string
  variables: string
  language: string
  tags: string
  downloads: number
  status: string
  is_builtin: number
  rating_total: number
  rating_count: number
  created_at: string
  updated_at: string
}

export interface TeamRow {
  id: number
  name: string
  owner_id: number
  created_at: string
}

export interface CommentRow {
  id: number
  doc_id: number
  user_id: number | null
  body: string
  resolved: number
  created_at: string
}

export interface ScheduleRow {
  id: number
  user_id: number
  doc_id: number | null
  cron: string
  timezone: string
  email_to: string | null
  webhook_url: string | null
  enabled: number
  next_run_at: string | null
  last_run_at: string | null
  created_at: string
}

export interface WebhookRow {
  id: number
  user_id: number
  name: string
  url: string
  secret: string | null
  events: string
  active: number
  created_at: string
}

export interface ApiKeyRow {
  id: number
  user_id: number
  name: string
  prefix: string
  key_hash: string
  scopes: string
  last_used_at: string | null
  revoked: number
  created_at: string
}
