import { useState, type Ref } from 'react'
import { CheckCircle2, Lock, ShieldCheck, X } from 'lucide-react'
import type { PermissionRequest } from '../../../shared/types'
import { Button } from '../ui/Button'
import { approvalTarget } from './toolCall'

interface Props {
  request: PermissionRequest
  cwd: string
  onResolve: () => void
  primaryActionRef?: Ref<HTMLButtonElement>
}

const TOOL_HINT: Record<string, string> = {
  Bash: 'will execute a shell command',
  PowerShell: 'will execute a PowerShell command',
  Edit: 'will modify a file',
  Write: 'will create or overwrite a file',
  Read: 'will read a file',
  WebFetch: 'will fetch a URL',
  WebSearch: 'will search the web',
  Glob: 'will glob files',
  Grep: 'will search file contents'
}

export function PermissionPrompt({ request, cwd, onResolve, primaryActionRef }: Props) {
  const [showRaw, setShowRaw] = useState(false)
  const summary = approvalTarget(request.toolName, request.toolInput, cwd)
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
    <div className="rounded-md border border-warning bg-widget p-3">
      <div className="flex items-start gap-2">
        <Lock size={14} className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-fg">
            <span className="font-semibold">{request.toolName}</span>{' '}
            <span className="text-muted">{hint}</span>
          </div>
          {summary && (
            <pre className="mt-1.5 whitespace-pre-wrap break-words rounded border border-subtle bg-editor px-2.5 py-1.5 font-mono text-[12px] text-fg">
              {summary}
            </pre>
          )}
          <button
            type="button"
            onClick={() => setShowRaw((s) => !s)}
            className="mt-1 text-[11px] text-link hover:underline"
          >
            {showRaw ? 'hide' : 'show'} full input
          </button>
          {showRaw && (
            <pre className="mt-1 max-h-40 overflow-auto rounded border border-subtle bg-editor px-2.5 py-1.5 font-mono text-[11px] text-fg">
              {JSON.stringify(request.toolInput, null, 2)}
            </pre>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button ref={primaryActionRef} onClick={() => respond('approve')}>
          <CheckCircle2 size={12} strokeWidth={2.25} />
          allow once
        </Button>
        <Button
          variant="secondary"
          onClick={() => respond('approve', true)}
          tooltip={`auto-allow ${request.toolName} for the rest of this chat session`}
        >
          <ShieldCheck size={12} strokeWidth={2.25} />
          allow for session
        </Button>
        <Button variant="secondary" onClick={() => respond('block')}>
          <X size={12} strokeWidth={2.25} />
          deny
        </Button>
      </div>
    </div>
  )
}
