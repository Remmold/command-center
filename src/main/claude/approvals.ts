import type {
  ApprovalReply,
  ApprovalRequest,
  ApprovalSettled,
  PermissionSuggestion,
  ToolInput
} from '../../shared/approval'
import { isRecord, type ControlPayload, type IncomingControlRequest, type IncomingHandler } from './controlChannel'

const REASON_TYPES_SHOWN = new Set(['safetyCheck', 'subcommandResults'])

interface Pending {
  request: ApprovalRequest
  paneId: string
  toolUseId: unknown
  resolve: (payload: ControlPayload) => void
}

function toRequest(paneId: string, requestId: string, raw: IncomingControlRequest): ApprovalRequest {
  const request: ApprovalRequest = {
    requestId,
    paneId,
    toolName: typeof raw.tool_name === 'string' ? raw.tool_name : 'unknown',
    input: isRecord(raw.input) ? (raw.input as ToolInput) : {},
    suggestions: Array.isArray(raw.permission_suggestions)
      ? (raw.permission_suggestions.filter(isRecord) as PermissionSuggestion[])
      : []
  }
  if (typeof raw.description === 'string') request.description = raw.description
  if (typeof raw.decision_reason === 'string' && REASON_TYPES_SHOWN.has(String(raw.decision_reason_type))) {
    request.reason = raw.decision_reason
  }
  return request
}

/** Holds each `can_use_tool` request until the user answers it in the chat. */
export class ApprovalBroker {
  private readonly pending = new Map<string, Pending>()
  private raisedListeners: Array<(request: ApprovalRequest) => void> = []
  private settledListeners: Array<(settled: ApprovalSettled) => void> = []

  handlerFor(paneId: string): IncomingHandler {
    return (raw, { requestId, signal }) => {
      if (raw.subtype !== 'can_use_tool') {
        return Promise.reject(new Error(`Unsupported control request: ${raw.subtype}`))
      }
      const request = toRequest(paneId, requestId, raw)
      return new Promise<ControlPayload>((resolve, reject) => {
        const onAbort = (): void => {
          if (!this.pending.delete(requestId)) return
          this.emitSettled({ requestId, paneId })
          reject(new Error('approval request cancelled'))
        }
        this.pending.set(requestId, {
          request,
          paneId,
          toolUseId: raw.tool_use_id,
          resolve: (payload) => {
            signal.removeEventListener('abort', onAbort)
            resolve(payload)
          }
        })
        signal.addEventListener('abort', onAbort, { once: true })
        for (const cb of this.raisedListeners) cb(request)
      })
    }
  }

  list(): ApprovalRequest[] {
    return Array.from(this.pending.values(), (entry) => entry.request)
  }

  respond(requestId: string, reply: ApprovalReply): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) return false
    this.pending.delete(requestId)
    entry.resolve({ ...reply, toolUseID: entry.toolUseId })
    this.emitSettled({ requestId, paneId: entry.paneId })
    return true
  }

  onRaised(cb: (request: ApprovalRequest) => void): () => void {
    this.raisedListeners.push(cb)
    return () => {
      this.raisedListeners = this.raisedListeners.filter((c) => c !== cb)
    }
  }

  onSettled(cb: (settled: ApprovalSettled) => void): () => void {
    this.settledListeners.push(cb)
    return () => {
      this.settledListeners = this.settledListeners.filter((c) => c !== cb)
    }
  }

  private emitSettled(settled: ApprovalSettled): void {
    for (const cb of this.settledListeners) cb(settled)
  }
}

export const approvalBroker = new ApprovalBroker()
