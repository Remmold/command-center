import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { parseSidebarLayout, type SidebarLayout } from '../../shared/sidebarGroups'

export interface SidebarGroupsStore {
  /** null before the first save, or when the file cannot be read as a layout. */
  load: () => Promise<SidebarLayout | null>
  save: (layout: unknown) => Promise<void>
}

export function createSidebarGroupsStore(dir: string): SidebarGroupsStore {
  const file = join(dir, 'sidebar-groups.json')
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.then(op, op)
    queue = next.catch(() => undefined)
    return next
  }

  return {
    load: () =>
      serial(async () => {
        try {
          return parseSidebarLayout(JSON.parse(await fs.readFile(file, 'utf-8')))
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) return null
          throw err
        }
      }),
    save: (raw) =>
      serial(async () => {
        const layout = parseSidebarLayout(raw)
        if (!layout) throw new Error('not a sidebar layout')
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(`${file}.tmp`, JSON.stringify(layout, null, 2), 'utf-8')
        await fs.rename(`${file}.tmp`, file)
      })
  }
}
