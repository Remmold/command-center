import { useState } from 'react'
import { CheckCircle2, Lock, ShieldCheck, X } from 'lucide-react'
import type { PermissionRequest } from '../../../shared/types'

interface Props {
  request: PermissionRequest
  onResolve: () => void
}

function summarizeTool(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  if (toolName === 'Bash' && typeof o.command === 'string') return o.command
  if (typeof o.file_path === 'string') return o.file_path
  if (typeof o.pattern === 'string') return o.pattern
  return ''
}

const TOOL_HINT: Record<string, string> = {
  Bash: 'will execute a shell command',
  Edit: 'will modify a file',
  Write: 'will create or overwrite a file',
  Read: 'will read a file',
  WebFetch: 'will fetch a URL',
  WebSearch: 'will search the web',
  Glob: 'will glob files',
  Grep: 'will search file contents'
}

export function PermissionPrompt({ request, onResolve }: Props) {
  const [showRaw, setShowRaw] = useState(false)
  const summary = summarizeTool(request.toolName, request.toolInput)
  const hint = TOOL_HINT[request.toolName] ?? 'wants permission to run'

  const respond = (decision: 'approve' | 'block', allowForSession = false) => {
    window.api.permission.respond(
      request.requestId,
      decision === 'approve'
        ? { decision: 'approve' }
        : { decision: 'block', reason: 'user denied' },
      allowForSession
    )
    onResolve()
  }

  return (
    <div className="rounded-md border border-amber-700/50 bg-amber-950/20 p-3">
      <div className="flex items-start gap-2">
        <Lock size={14} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-zinc-200">
            <span className="font-medium text-amber-300">{request.toolName}</span>{' '}
            <span className="text-zinc-400">{hint}</span>
          </div>
          {summary && (
            <pre className="mt-1 overflow-x-auto rounded bg-black/40 px-2 py-1 text-[11px] text-zinc-300">
              {summary}
            </pre>
          )}
          <button
            onClick={() => setShowRaw((s) => !s)}
            className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            {showRaw ? 'hide' : 'show'} full input
          </button>
          {showRaw && (
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/40 px-2 py-1 text-[10px] text-zinc-300">
              {JSON.stringify(request.toolInput, null, 2)}
            </pre>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => respond('approve')}
          className="flex items-center gap-1 rounded bg-emerald-700 px-3 py-1 text-xs text-emerald-50 hover:bg-emerald-600"
        >
          <CheckCircle2 size={12} strokeWidth={2.25} />
          allow once
        </button>
        <button
          onClick={() => respond('approve', true)}
          className="flex items-center gap-1 rounded bg-emerald-900 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-800"
          title={`auto-allow ${request.toolName} for the rest of this chat session`}
        >
          <ShieldCheck size={12} strokeWidth={2.25} />
          allow for session
        </button>
        <button
          onClick={() => respond('block')}
          className="flex items-center gap-1 rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-red-950 hover:text-red-300"
        >
          <X size={12} strokeWidth={2.25} />
          deny
        </button>
      </div>
    </div>
  )
}
