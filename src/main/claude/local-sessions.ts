import { promises as fs, createReadStream } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

export interface LocalSessionInfo {
  sessionId: string
  modifiedAt: number
  preview: string
  messageCount: number
}

function sanitizeCwd(cwd: string): string {
  return cwd.replace(/[:\\/]/g, '-')
}

function claudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

async function readFirstUserText(filePath: string): Promise<{ preview: string; count: number }> {
  return new Promise((resolve) => {
    let preview = ''
    let count = 0
    const stream = createReadStream(filePath, { encoding: 'utf-8' })
    const rl = createInterface({ input: stream })
    let done = false
    rl.on('line', (line) => {
      if (done && count > 1000) return
      count++
      if (preview || done) return
      try {
        const parsed = JSON.parse(line) as {
          message?: { role?: string; content?: Array<{ type?: string; text?: string }> }
          type?: string
        }
        const msg = parsed.message
        if (msg?.role === 'user' && Array.isArray(msg.content)) {
          const text = msg.content.find((c) => c?.type === 'text')?.text
          if (typeof text === 'string' && text.trim().length > 0) {
            preview = text.replace(/\s+/g, ' ').trim().slice(0, 160)
            done = true
          }
        }
      } catch {
        // ignore malformed lines
      }
    })
    rl.on('close', () => resolve({ preview, count }))
    rl.on('error', () => resolve({ preview, count }))
  })
}

export async function listLocalSessions(cwd: string): Promise<LocalSessionInfo[]> {
  const dir = join(claudeProjectsDir(), sanitizeCwd(cwd))
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const sessions: LocalSessionInfo[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    const full = join(dir, entry)
    let stat
    try {
      stat = await fs.stat(full)
    } catch {
      continue
    }
    const sessionId = entry.replace(/\.jsonl$/, '')
    const { preview, count } = await readFirstUserText(full)
    sessions.push({
      sessionId,
      modifiedAt: stat.mtime.getTime(),
      preview: preview || '(no user text)',
      messageCount: count
    })
  }
  sessions.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return sessions
}
