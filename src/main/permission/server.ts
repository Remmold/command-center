import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'

export interface PermissionRequest {
  requestId: string
  paneId: string
  toolName: string
  toolInput: unknown
  sessionId?: string
}

export interface PermissionResolved {
  requestId: string
  paneId: string
}

export interface PermissionResponse {
  decision: 'approve' | 'block'
  reason?: string
  modifiedInput?: unknown
}

interface Pending {
  paneId: string
  toolName: string
  resolve: (response: PermissionResponse) => void
}

export class PermissionServer extends EventEmitter {
  private server: Server | null = null
  private portValue: number | null = null
  private pending = new Map<string, Pending>()
  /** Per-pane session-wide allow cache for "allow for session" decisions. */
  private sessionAllows = new Map<string, Set<string>>()

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handle(req, res))
      this.server.on('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address()
        if (typeof addr === 'object' && addr && 'port' in addr) {
          this.portValue = addr.port
          resolve(addr.port)
        } else {
          reject(new Error('failed to obtain listening port'))
        }
      })
    })
  }

  get port(): number | null {
    return this.portValue
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.url !== '/permission' || req.method !== 'POST') {
      res.writeHead(404).end()
      return
    }
    let body = ''
    req.setEncoding('utf-8')
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      let payload: {
        paneId: string
        toolName: string
        toolInput: unknown
        sessionId?: string
      }
      try {
        payload = JSON.parse(body)
      } catch {
        res.writeHead(400).end()
        return
      }

      // Session-allow cache hit → approve without prompting.
      const allows = this.sessionAllows.get(payload.paneId)
      if (allows?.has(payload.toolName)) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ decision: 'approve' }))
        return
      }

      const requestId = randomUUID()
      this.pending.set(requestId, {
        paneId: payload.paneId,
        toolName: payload.toolName,
        resolve: (response) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(response))
        }
      })

      const request: PermissionRequest = {
        requestId,
        paneId: payload.paneId,
        toolName: payload.toolName,
        toolInput: payload.toolInput,
        sessionId: payload.sessionId
      }
      this.emit('request', request)

      // Timeout safety: if no response after 10 min, deny.
      const timer = setTimeout(() => {
        this.settle(requestId, { decision: 'block', reason: 'no response from user' })
      }, 600_000)
      // Make sure to clear timer when resolved early.
      const original = this.pending.get(requestId)
      if (original) {
        this.pending.set(requestId, {
          ...original,
          resolve: (r) => {
            clearTimeout(timer)
            original.resolve(r)
          }
        })
      }
    })
  }

  respond(
    requestId: string,
    response: PermissionResponse,
    options: { allowForSession?: boolean } = {}
  ): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false
    if (options.allowForSession && response.decision === 'approve') {
      let allows = this.sessionAllows.get(pending.paneId)
      if (!allows) {
        allows = new Set()
        this.sessionAllows.set(pending.paneId, allows)
      }
      allows.add(pending.toolName)
    }
    this.settle(requestId, response)
    return true
  }

  private settle(requestId: string, response: PermissionResponse): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)
    pending.resolve(response)
    const resolved: PermissionResolved = { requestId, paneId: pending.paneId }
    this.emit('resolved', resolved)
  }

  clearPane(paneId: string): void {
    this.sessionAllows.delete(paneId)
    // Reject any pending requests for this pane
    for (const [requestId, p] of Array.from(this.pending)) {
      if (p.paneId === paneId) this.settle(requestId, { decision: 'block', reason: 'session ended' })
    }
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
    })
  }
}

export const permissionServer = new PermissionServer()
