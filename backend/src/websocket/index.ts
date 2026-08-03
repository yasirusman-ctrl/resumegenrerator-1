import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Server } from 'node:http'
import { fetchGitHubUserData } from '../services/github.js'
import { renderTemplate } from '../templates/registry.js'
import { compileLaTeX } from '../utils/compile.js'
import { createResume } from '../db/index.js'
import { getDoc, parseDocData, updateDoc } from '../db/docs.js'
import { docAccess } from '../routes/v1/perms.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('ws')

interface WsMessage {
  type: 'compile' | 'subscribe' | 'unsubscribe' | 'edit' | 'cursor' | 'presence'
  username?: string
  template?: string
  customSections?: Array<{ title: string; items: string[] }>
  docId?: number
  data?: unknown
  version?: number
  token?: string
}

const rooms = new Map<number, Set<WebSocket>>()

function roomMembers(docId: number): Set<WebSocket> {
  let set = rooms.get(docId)
  if (!set) {
    set = new Set()
    rooms.set(docId, set)
  }
  return set
}

function broadcast(docId: number, sender: WebSocket, payload: unknown) {
  const members = rooms.get(docId)
  if (!members) return
  const msg = JSON.stringify(payload)
  for (const ws of members) {
    if (ws !== sender && ws.readyState === ws.OPEN) ws.send(msg)
  }
}

function parseToken(c: IncomingMessage): { id: number } | null {
  const url = c.url || ''
  const q = new URL(url, 'http://localhost').searchParams
  const token = q.get('token')
  if (!token) return null
  // lazily require verifyToken to keep ws module decoupled
  return verifyWsToken(token)
}

let verifyWsToken: (token: string) => { id: number } | null = () => null

export function setTokenVerifier(fn: (token: string) => { id: number } | null): void {
  verifyWsToken = fn
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    log.info('client connected')

    ws.on('message', async (raw: Buffer) => {
      try {
        const msg: WsMessage = JSON.parse(raw.toString())

        switch (msg.type) {
          case 'compile': {
            if (!msg.username) throw new Error('username required')
            ws.send(JSON.stringify({ type: 'progress', step: 'fetching', message: 'Fetching GitHub data...' }))

            const userData = await fetchGitHubUserData(msg.username, msg.customSections || [])

            ws.send(JSON.stringify({ type: 'progress', step: 'rendering', message: 'Rendering template...' }))

            const texContent = renderTemplate(msg.template || 'modern', userData)

            const pdfBuffer = await compileLaTeX(texContent, (step, message) => {
              ws.send(JSON.stringify({ type: 'progress', step, message }))
            })

            ws.send(JSON.stringify({ type: 'progress', step: 'saving', message: 'Saving resume...' }))

            const record = createResume(msg.username, msg.template || 'modern', msg.customSections || [], userData.stats as any)

            ws.send(JSON.stringify({
              type: 'complete',
              shareId: record.share_id,
              stats: userData.stats,
            }))
            break
          }

          case 'subscribe': {
            if (!msg.docId) throw new Error('docId required')
            const doc = getDoc(msg.docId)
            if (!doc) throw new Error('Resume not found')
            const tokenUser = parseToken(req)
            const fakeCtx = {
              req: { param: () => String(doc.id) },
              get: (k: string) => (k === 'user' ? tokenUser : undefined),
            } as never
            const access = docAccess(fakeCtx, doc)
            if (access === 'none') throw new Error('No access to this resume')
            const members = roomMembers(doc.id)
            members.add(ws)
            broadcast(doc.id, ws, { type: 'presence', members: members.size })
            break
          }

          case 'unsubscribe': {
            if (msg.docId) {
              const members = rooms.get(msg.docId)
              members?.delete(ws)
              broadcast(msg.docId, ws, { type: 'presence', members: members?.size || 0 })
            }
            break
          }

          case 'edit': {
            if (!msg.docId) throw new Error('docId required')
            const doc = getDoc(msg.docId)
            if (!doc) throw new Error('Resume not found')
            const user = parseToken(req) || { id: 0 }
            const current = parseDocData(doc.data)
            updateDoc(doc.id, { data: { ...current, ...(msg.data as Record<string, unknown>) } })
            broadcast(doc.id, ws, { type: 'edit', docId: doc.id, data: msg.data, by: user.id })
            break
          }

          case 'cursor': {
            if (!msg.docId) break
            broadcast(msg.docId, ws, { type: 'cursor', docId: msg.docId, data: msg.data })
            break
          }

          case 'presence': {
            if (!msg.docId) break
            ws.send(JSON.stringify({ type: 'presence', docId: msg.docId, members: roomMembers(msg.docId).size }))
            break
          }

          default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }))
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        log.error({ err: message }, 'ws message failed')
        ws.send(JSON.stringify({ type: 'error', message }))
      }
    })

    ws.on('close', () => {
      for (const [docId, members] of rooms) {
        if (members.delete(ws)) {
          broadcast(docId, ws, { type: 'presence', members: members.size })
        }
      }
      log.info('client disconnected')
    })
  })

  log.info('websocket server ready')
}
