import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Node.js script content for the PreToolUse hook. Written to disk on first
 * launch so claude can spawn it. No external dependencies — pure Node core.
 *
 * Reads tool info from stdin, contacts our localhost server (CC_PERMISSION_PORT)
 * to get the user's decision, then writes a decision JSON to stdout.
 *
 * The hook stays in the repo's settings, so sessions the app did not start (VS Code,
 * a terminal) run it too: without the app's env vars it makes no decision, and
 * Claude's own permission prompts apply.
 */
const HOOK_SCRIPT = `#!/usr/bin/env node
// command-center permission hook — auto-generated, do not edit
'use strict'
const http = require('http')

let stdin = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', (c) => { stdin += c })
process.stdin.on('end', () => {
  let payload = {}
  try { payload = JSON.parse(stdin) } catch (_) {}

  const port = process.env.CC_PERMISSION_PORT
  const paneId = process.env.CC_PANE_ID
  const mode = process.env.CC_PERMISSION_MODE || 'ask'

  if (!port || !paneId) process.exit(0)

  const toolName = payload.tool_name || payload.toolName || 'unknown'
  const toolInput = payload.tool_input || payload.toolInput || {}
  const sessionId = payload.session_id || payload.sessionId || ''

  // acceptEdits: file edits auto-approve, everything else asks.
  const AUTO_APPROVE_IN_ACCEPT_EDITS = new Set(['Edit', 'Write', 'NotebookEdit'])
  if (mode === 'acceptEdits' && AUTO_APPROVE_IN_ACCEPT_EDITS.has(toolName)) {
    process.stdout.write(JSON.stringify({ decision: 'approve' }))
    process.exit(0)
  }

  const requestBody = JSON.stringify({
    paneId,
    toolName,
    toolInput,
    sessionId,
    mode
  })

  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: Number(port),
      path: '/permission',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      },
      timeout: 600000
    },
    (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        try {
          const response = JSON.parse(body)
          process.stdout.write(JSON.stringify(response))
          process.exit(0)
        } catch (_) {
          // server returned malformed — default deny
          process.stdout.write(JSON.stringify({ decision: 'block', reason: 'malformed permission server response' }))
          process.exit(0)
        }
      })
    }
  )
  req.on('error', () => {
    // A hosted session runs with the CLI's own prompts off, so allowing here would allow everything.
    process.stdout.write(JSON.stringify({ decision: 'block', reason: 'command center is not reachable to ask for approval' }))
    process.exit(0)
  })
  req.on('timeout', () => {
    req.destroy()
    process.stdout.write(JSON.stringify({ decision: 'block', reason: 'permission request timed out' }))
    process.exit(0)
  })
  req.write(requestBody)
  req.end()
})
`

export async function ensureHookScriptInstalled(scriptPath: string): Promise<void> {
  await fs.mkdir(dirname(scriptPath), { recursive: true })
  await fs.writeFile(scriptPath, HOOK_SCRIPT, 'utf-8')
}

export function hookCommandFor(scriptPath: string): string {
  // Use forward slashes so Windows paths don't need backslash escaping in JSON
  const normalized = scriptPath.replace(/\\/g, '/')
  return `node "${normalized}"`
}
