import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { JustStarted } from '../../shared/mainChat'

export interface MainChatSaved {
  /** The account chosen in Settings; unset until chosen. */
  profileId?: string
  claudeSessionId?: string
  /** The feature whose Go started the current conversation. */
  justStarted?: JustStarted
}

const isJustStarted = (v: unknown): v is JustStarted =>
  typeof v === 'object' && v !== null && typeof (v as JustStarted).name === 'string' && typeof (v as JustStarted).workspace === 'string'

/** The main chat's own small file: its account choice, the Claude id that resumes it, and the feature that began it. */
export function createMainChatStore(file: string) {
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.then(op, op)
    queue = next.catch(() => undefined)
    return next
  }
  const read = async (): Promise<MainChatSaved> => {
    try {
      const raw = JSON.parse(await fs.readFile(file, 'utf-8')) as Record<string, unknown> | null
      const started = raw?.justStarted
      return {
        ...(typeof raw?.profileId === 'string' ? { profileId: raw.profileId } : {}),
        ...(typeof raw?.claudeSessionId === 'string' ? { claudeSessionId: raw.claudeSessionId } : {}),
        ...(isJustStarted(started) ? { justStarted: { name: started.name, workspace: started.workspace } } : {})
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) return {}
      throw err
    }
  }
  const write = async (saved: MainChatSaved): Promise<void> => {
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.writeFile(`${file}.tmp`, JSON.stringify(saved, null, 2), 'utf-8')
    await fs.rename(`${file}.tmp`, file)
  }
  return {
    get: (): Promise<MainChatSaved> => serial(read),
    /** A new account starts a new conversation: the old transcript lives in the old account's folder. */
    setProfile: (profileId: string): Promise<MainChatSaved> =>
      serial(async () => {
        const saved = await read()
        if (saved.profileId === profileId) return saved
        const next = { profileId }
        await write(next)
        return next
      }),
    setClaudeSession: (claudeSessionId: string): Promise<void> =>
      serial(async () => {
        const saved = await read()
        if (saved.claudeSessionId !== claudeSessionId) await write({ ...saved, claudeSessionId })
      }),
    /** Forgets the conversation so the next start is a fresh one; after a Go, remembers the feature it started. The account stays. */
    reset: (justStarted?: JustStarted): Promise<MainChatSaved> =>
      serial(async () => {
        const { profileId } = await read()
        const next: MainChatSaved = { ...(profileId ? { profileId } : {}), ...(justStarted ? { justStarted } : {}) }
        await write(next)
        return next
      })
  }
}
