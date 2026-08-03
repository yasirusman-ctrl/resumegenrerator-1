import { serve, type HttpBindings } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import type { Server } from 'node:http'
import 'dotenv/config'

import { rateLimit } from './middleware/rateLimit.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { setupWebSocket } from './websocket/index.js'
import { createLogger } from './utils/logger.js'
import { startScheduler } from './services/scheduler.js'
import { seedBuiltinTemplates } from './services/seedTemplates.js'

import generateRoute from './routes/v1/generate.js'
import historyRoute from './routes/v1/history.js'
import authRoute from './routes/v1/auth.js'
import docsRoute from './routes/v1/docs.js'
import shareRoute from './routes/v1/share.js'
import editorRoute from './routes/v1/editor.js'
import aiRoute from './routes/v1/ai.js'
import importRoute from './routes/v1/import.js'
import teamsRoute from './routes/v1/teams.js'
import marketplaceRoute from './routes/v1/marketplace.js'
import automationRoute from './routes/v1/automation.js'
import apiKeysRoute from './routes/v1/apiKeys.js'
import validateRoute from './routes/v1/validate.js'
import analyticsRoute from './routes/v1/analytics.js'
import i18nRoute from './routes/v1/i18n.js'

const log = createLogger('app')

if (!process.env.GITHUB_TOKEN) {
  log.warn('GITHUB_TOKEN not set. Rate limit reduced.')
}

const app = new Hono<{ Bindings: HttpBindings }>()

app.use('*', cors(), honoLogger(), rateLimit(), securityHeaders())

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

const v1 = new Hono()
v1.route('/generate', generateRoute)
v1.route('/resumes', historyRoute)
v1.route('/auth', authRoute)
v1.route('/docs', docsRoute)
v1.route('/share', shareRoute)
v1.route('/editor', editorRoute)
v1.route('/ai', aiRoute)
v1.route('/import', importRoute)
v1.route('/teams', teamsRoute)
v1.route('/marketplace', marketplaceRoute)
v1.route('/automation', automationRoute)
v1.route('/api-keys', apiKeysRoute)
v1.route('/validate', validateRoute)
v1.route('/analytics', analyticsRoute)
v1.route('/i18n', i18nRoute)

app.route('/api/v1', v1)
app.route('/api', v1)
app.route('/share', shareRoute)

seedBuiltinTemplates()

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000

const server = serve(
  { fetch: app.fetch, port },
  (info) => log.info({ addr: info }, 'listening'),
) as unknown as Server

setupWebSocket(server)

if (process.env.DISABLE_SCHEDULER !== 'true') {
  startScheduler()
}
