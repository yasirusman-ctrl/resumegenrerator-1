# Resume Generator API Documentation

Full-featured resume platform backend. Auth, documents/versions, templates marketplace, teams, automation (schedules + webhooks + email), AI assistant, imports, analytics/A-B tests, i18n, and a public API with SDK + CLI.

Base URL: `http://localhost:3000`. All routes under `/api/v1` are also mounted at `/api`.

## Authentication

Register/login returns a JWT. Send it as `Authorization: Bearer <token>`.

```
POST /api/v1/auth/register   { email, password, username }
POST /api/v1/auth/login      { email, password }        -> { token, user }
GET  /api/v1/auth/me                                   -> { user, settings }
PATCH /api/v1/auth/me                                   { name?, bio?, avatar? }
GET  /api/v1/auth/settings                              -> { settings }
PATCH /api/v1/auth/settings                             { default_template?, default_accent?, default_font?, locale?, theme? }
```

API keys: create via UI or `POST /api/v1/api-keys`, then use `Authorization: Bearer <apiKey>`.

## Documents (resumes)

```ts
// ResumeData shape
{ contact: Record<string,string>, summary: string, skills: string[],
  sections: Array<{ id: string, type: string, title: string, items: string[] }> }
```

```
POST   /api/v1/docs                    { title, data, template_id?, template_key?, locale?, accent?, font?, visibility?, team_id? }
GET    /api/v1/docs                     -> { docs }
GET    /api/v1/docs/:id                 -> { doc, template?, access }
PATCH  /api/v1/docs/:id                 partial of above
DELETE /api/v1/docs/:id
GET    /api/v1/docs/:id/versions        -> { versions }
GET    /api/v1/docs/:id/versions/:v
POST   /api/v1/docs/:id/versions/:v/restore
POST   /api/v1/docs/:id/share?visibility=public|private   -> { share_id, url: "/share/:id" }
GET    /api/v1/docs/:id/export?format=pdf|html|docx|txt    (binary/stream)
GET    /api/v1/docs/:id/validate        -> { score, pass, issues[] }
GET    /api/v1/docs/:id/analytics       -> { stats: { views, downloads } }
GET    /api/v1/docs/:id/comments        -> { comments }
POST   /api/v1/docs/:id/comments        { body }
POST   /api/v1/docs/:id/comments/:cid/resolve
DELETE /api/v1/docs/:id/comments/:cid
```

Legacy `GET /api/v1/resumes?username=` and `GET /api/v1/resumes/:shareId/(html|pdf)` are preserved.

## Public shares

```
GET /api/v1/share/:shareId             -> rendered HTML page (no auth)
GET /api/v1/share/:shareId/export?format=html|pdf|docx|txt
GET /api/v1/share/ab/:shareId          -> A/B variant redirect (server picks variant by viewer)
```

## Editor + templates

```
POST /api/v1/editor/preview   { data, template_id?, template_key?, accent?, font?, locale?, variables? } -> { html, tex }
GET  /api/v1/editor/templates           -> built-in template keys
GET  /api/v1/editor/templates/:id
```

## AI assistant (local offline fallback; remote LLM when AI_API_URL+AI_API_KEY set)

```
POST /api/v1/ai/suggest-bullets  { role, existing?, provider? } -> { bullets[], provider }
POST /api/v1/ai/rewrite          { text, tone: formal|concise|action|friendly, provider? } -> { bullet, provider }
POST /api/v1/ai/summary          { role, skills?, provider? } -> { summary, provider }
POST /api/v1/ai/skills           { role, provider? } -> { skills[], provider }
```

## Import (GitHub / LinkedIn)

```
GET  /api/v1/import/fields            -> field list
POST /api/v1/import/github            { username }      -> { source }
POST /api/v1/import/linkedin          { text }          -> { source }
POST /api/v1/import/map               { source, mapping: {sourceField: targetField} } -> { source }
POST /api/v1/import/to-resume         { source, title? } -> { data, doc? }
```

## Marketplace

```
GET    /api/v1/marketplace?query=&author=&status=&limit=   -> { templates[] }
GET    /api/v1/marketplace/:slug      -> { template } (includes content_html/content_tex)
GET    /api/v1/marketplace/favorites  (auth)
GET    /api/v1/marketplace/mine       (auth)
POST   /api/v1/marketplace            { name, description?, content_html, content_tex?, variables?, language?, tags? }
PATCH  /api/v1/marketplace/:slug
DELETE /api/v1/marketplace/:slug
POST   /api/v1/marketplace/:slug/rate       { rating: 1-5, comment? }  -> { template }
POST   /api/v1/marketplace/:slug/favorite   (auth)
DELETE /api/v1/marketplace/:slug/favorite   (auth)
GET    /api/v1/marketplace/:slug/me         (auth) -> { favorited, rating }
```

## Teams

```
GET    /api/v1/teams              -> { teams }
POST   /api/v1/teams              { name }
GET    /api/v1/teams/:id          -> { team, members, role }
DELETE /api/v1/teams/:id          (owner only)
POST   /api/v1/teams/:id/members  { username | email, role: viewer|editor|owner }
PATCH  /api/v1/teams/:id/members/:uid  { role }
DELETE /api/v1/teams/:id/members/:uid
GET    /api/v1/teams/:id/docs
POST   /api/v1/teams/:id/docs     { title, data? }
```

## Automation

```
GET  /api/v1/automation/schedules            -> { schedules }
POST /api/v1/automation/schedules            { doc_id?, cron, timezone?, email_to?, webhook_url? }
PATCH /api/v1/automation/schedules/:id
DELETE /api/v1/automation/schedules/:id
POST /api/v1/automation/schedules/:id/run
GET  /api/v1/automation/schedules/next?cron=0 9 * * *     -> { next } (no auth)
GET  /api/v1/automation/webhooks             -> { webhooks }
POST /api/v1/automation/webhooks             { name, url, secret?, events[] }
DELETE /api/v1/automation/webhooks/:id
POST /api/v1/automation/webhooks/test        { url, secret?, event? } -> { ok, status }
```

Scheduled runs render the doc and either email the PDF (SMTP via `SMTP_*` env) or POST a signed webhook (`X-Resume-Signature: sha256=hmac(secret, payload)`).

## Validation

```
POST /api/v1/validate   { data? | name?, email?, ... } -> { score, pass, issues[] }
```

## Analytics & A/B testing

```
GET  /api/v1/analytics/ab-tests        -> { tests }
POST /api/v1/analytics/ab-tests        { name, doc_ids: number[] (>=2) } -> { test, url }
GET  /api/v1/analytics/ab-tests/:id    -> { test, variants[] }
GET  /api/v1/analytics/doc/:id         -> { stats }
```

## i18n

```
GET /api/v1/i18n/langs     -> { langs }
GET /api/v1/i18n/:lang     -> { translations }
PUT /api/v1/i18n/          { lang, translations } (auth)
```

## WebSocket (collaborative editing)

`ws://localhost:3000/ws?token=<jwt>` — subscribe to doc rooms, broadcast edits, cursor presence, and compile progress. See `backend/src/websocket/index.ts`.

## SDK + CLI

See `sdk/` package:

```ts
import { ResumeSDK } from 'resume-sdk'
const sdk = new ResumeSDK({ baseUrl: 'http://localhost:3000' })
await sdk.auth.login('user@example.com', 'secret')
await sdk.docs.create({ title: 'My Resume', data: sdk.emptyData() })
```

CLI:

```bash
resume login --email user@example.com --password secret
resume docs list
resume docs create --title "My Resume"
resume docs export 1 --format pdf --out resume.pdf
resume validate 1
resume schedule create --cron "0 9 * * 1" --email me@example.com
resume ab create --name "Test" --docs 1,2
resume template upload --file template.html --name "Custom"
```

## Environment

| Var | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `JWT_SECRET` | HMAC secret for tokens (default dev secret) |
| `DB_PATH` | SQLite path (default `data/resumes.db`) |
| `GITHUB_TOKEN` | GitHub API token for importer |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Email delivery for scheduled resumes |
| `AI_API_URL`, `AI_API_KEY` | Optional remote LLM; falls back to local heuristics |
| `APP_URL` | Public base URL used in emails/webhooks |
| `DISABLE_SCHEDULER` | Set `true` to skip the cron loop |

## Tests

```bash
cd backend && npm test && npm run typecheck
cd frontend && npm test && npm run build
```
