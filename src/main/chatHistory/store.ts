import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { applyHistoryChange, isHistoryChange, type HistoryChange } from '../../shared/chatHistory'
import type { ChatItem } from '../../shared/chatItems'

export interface ChatHistoryStore {
  /** Every saved session's items by pane id; compacts each file it reads. A file that cannot be read loads as empty. */
  load: () => Promise<Record<string, ChatItem[]>>
  /** Appends the changes to the session's file, after every change handed over before them. */
  apply: (paneId: string, changes: readonly HistoryChange[]) => Promise<void>
  delete: (paneId: string) => Promise<void>
}

const EXT = '.jsonl'

const fileName = (paneId: string): string => `${encodeURIComponent(paneId).replace(/\*/g, '%2A')}${EXT}`

const missing = (err: unknown): boolean => (err as NodeJS.ErrnoException).code === 'ENOENT'

function parseRecord(line: string): HistoryChange | null {
  try {
    const record: unknown = JSON.parse(line)
    return isHistoryChange(record) ? record : null
  } catch {
    return null
  }
}

/** The changes in a file, and whether all of it was readable; a last line cut off mid-write is dropped. */
function parseLog(text: string): { changes: HistoryChange[]; ok: boolean } {
  const lines = text.split('\n')
  const tail = lines.pop() ?? ''
  const changes: HistoryChange[] = []
  for (const line of lines) {
    if (line === '') continue
    const change = parseRecord(line)
    if (!change) return { changes: [], ok: false }
    changes.push(change)
  }
  const last = tail === '' ? null : parseRecord(tail)
  if (last) changes.push(last)
  return { changes, ok: true }
}

/** One append-only log of history changes per hosted session, in `dir`. */
export function createChatHistoryStore(dir: string): ChatHistoryStore {
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.then(op, op)
    queue = next.catch(() => undefined)
    return next
  }

  async function compact(file: string, items: ChatItem[]): Promise<void> {
    await fs.writeFile(`${file}.tmp`, `${JSON.stringify({ kind: 'set', items } satisfies HistoryChange)}\n`, 'utf-8')
    await fs.rename(`${file}.tmp`, file)
  }

  async function loadFile(file: string): Promise<ChatItem[]> {
    const text = await fs.readFile(file, 'utf-8')
    const { changes, ok } = parseLog(text)
    if (!ok) {
      await fs.rename(file, `${file}.corrupt`)
      return []
    }
    const items = changes.reduce(applyHistoryChange, [] as ChatItem[])
    if (changes.length !== 1 || changes[0].kind !== 'set' || !text.endsWith('\n')) await compact(file, items)
    return items
  }

  return {
    load: () =>
      serial(async () => {
        let names: string[]
        try {
          names = await fs.readdir(dir)
        } catch (err) {
          if (missing(err)) return {}
          throw err
        }
        const out: Record<string, ChatItem[]> = {}
        for (const name of names) {
          if (!name.endsWith(EXT)) continue
          let paneId: string
          try {
            paneId = decodeURIComponent(name.slice(0, -EXT.length))
          } catch {
            continue
          }
          try {
            out[paneId] = await loadFile(join(dir, name))
          } catch (err) {
            console.error(`could not read the chat history of ${paneId}`, err)
            out[paneId] = []
          }
        }
        return out
      }),
    apply: (paneId, changes) =>
      serial(async () => {
        const file = join(dir, fileName(paneId))
        let lines = ''
        for (const change of changes) {
          if (change.kind === 'delete') {
            lines = ''
            await fs.rm(file, { force: true })
          } else {
            lines += `${JSON.stringify(change)}\n`
          }
        }
        if (!lines) return
        await fs.mkdir(dir, { recursive: true })
        await fs.appendFile(file, lines, 'utf-8')
      }),
    delete: (paneId) => serial(() => fs.rm(join(dir, fileName(paneId)), { force: true }))
  }
}
