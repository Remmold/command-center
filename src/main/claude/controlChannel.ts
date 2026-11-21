import { randomUUID } from 'node:crypto'

export type ControlPayload = Record<string, unknown>

const CONTROL_TIMEOUT_MS = 20_000

/** A request the CLI sends to the host, e.g. `can_use_tool`. */
export interface IncomingControlRequest {
  subtype: string
  [field: string]: unknown
}

export interface IncomingContext {
  requestId: string
  /** Aborted when the CLI cancels the request or the process goes away. */
  signal: AbortSignal
}

/** Resolves to the success payload; a throw is sent back as an error reply. */
export type IncomingHandler = (request: IncomingControlRequest, context: IncomingContext) => Promise<ControlPayload>

export interface ControlChannelOptions {
  write: (line: string) => void
  newId?: () => string
}

interface Pending {
  resolve: (payload: ControlPayload) => void
  reject: (err: Error) => void
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class ControlChannel {
  private readonly write: (line: string) => void
  private readonly newId: () => string
  private readonly pending = new Map<string, Pending>()
  private incoming: IncomingHandler | null = null
  private readonly answering = new Map<string, AbortController>()

  constructor(options: ControlChannelOptions) {
    this.write = options.write
    this.newId = options.newId ?? randomUUID
  }

  request(subtype: string, fields: ControlPayload = {}): Promise<ControlPayload> {
    const requestId = this.newId()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(requestId)) return
        reject(new Error(`control request ${subtype} timed out after ${CONTROL_TIMEOUT_MS} ms`))
      }, CONTROL_TIMEOUT_MS)
      this.pending.set(requestId, {
        resolve: (payload) => {
          clearTimeout(timer)
          resolve(payload)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        }
      })
      this.write(
        JSON.stringify({
          type: 'control_request',
          request_id: requestId,
          request: { subtype, ...fields }
        }) + '\n'
      )
    })
  }

  /** Takes a parsed stdout line; true when it belongs to the control channel and must not reach the chat. */
  accept(message: unknown): boolean {
    if (!isRecord(message)) return false
    if (message.type === 'control_response') {
      this.settle(message.response)
      return true
    }
    if (message.type === 'control_request') {
      if (typeof message.request_id === 'string' && isRecord(message.request)) {
        void this.answer(message.request_id, message.request as IncomingControlRequest)
      }
      return true
    }
    if (message.type === 'control_cancel_request') {
      if (typeof message.request_id === 'string') this.answering.get(message.request_id)?.abort()
      return true
    }
    return false
  }

  /** Rejects every open request; later replies are ignored. */
  close(reason: string): void {
    const open = Array.from(this.pending.values())
    this.pending.clear()
    for (const entry of open) entry.reject(new Error(reason))
    const answering = Array.from(this.answering.values())
    this.answering.clear()
    for (const controller of answering) controller.abort()
  }

  setIncomingHandler(handler: IncomingHandler | null): void {
    this.incoming = handler
  }

  private async answer(requestId: string, request: IncomingControlRequest): Promise<void> {
    if (this.answering.has(requestId)) return
    const controller = new AbortController()
    this.answering.set(requestId, controller)
    let response: ControlPayload
    try {
      if (!this.incoming) throw new Error(`Unsupported control request: ${request.subtype}`)
      response = {
        subtype: 'success',
        request_id: requestId,
        response: await this.incoming(request, { requestId, signal: controller.signal })
      }
    } catch (err) {
      response = { subtype: 'error', request_id: requestId, error: (err as Error).message }
    } finally {
      this.answering.delete(requestId)
    }
    this.write(JSON.stringify({ type: 'control_response', response }) + '\n')
  }

  private settle(response: unknown): void {
    if (!isRecord(response) || typeof response.request_id !== 'string') return
    const entry = this.pending.get(response.request_id)
    if (!entry) return
    this.pending.delete(response.request_id)
    if (response.subtype === 'error') {
      const text = typeof response.error === 'string' ? response.error : 'control request failed'
      entry.reject(new Error(text))
      return
    }
    entry.resolve(isRecord(response.response) ? response.response : {})
  }
}
