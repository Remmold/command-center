import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stampOf } from './reader'
import { TestFlowWatches } from './watch'

let folder: string
let changes: string[]
let watches: TestFlowWatches

const QUIET_MS = 400
const quiet = () => new Promise((done) => setTimeout(done, QUIET_MS))
const watched = async (path: string) => ({ path, stamp: await stampOf(path) })
// writeFile empties the file before it writes, and a busy machine can check in between; a rename lands whole.
const rewrite = async (path: string, text: string) => {
  await fs.writeFile(`${path}.tmp`, text)
  await fs.rename(`${path}.tmp`, path)
}

beforeEach(async () => {
  folder = await fs.mkdtemp(join(tmpdir(), 'cc-test-flow-watch-'))
  changes = []
  watches = new TestFlowWatches((watcher) => changes.push(watcher), { pollMs: 100, settleMs: 40 })
})

afterEach(async () => {
  watches.dispose()
  await fs.rm(folder, { recursive: true, force: true })
})

describe('watching a shown test flow', () => {
  it('sends one change event when the file is rewritten', async () => {
    const page = join(folder, 'run.html')
    await fs.writeFile(page, '<h1>one</h1>')
    watches.set('tab', [await watched(page)])
    await quiet()
    expect(changes).toEqual([])

    await rewrite(page, '<h1>two, longer</h1>')
    await quiet()
    expect(changes).toEqual(['tab'])
  })

  it('sends a change event when a candidate that did not exist appears', async () => {
    const next = join(folder, 'next.md')
    watches.set('tab', [await watched(next)])
    await rewrite(next, '# Next')
    await quiet()
    expect(changes).toEqual(['tab'])
  })

  it('tells a watcher that joins with an older stamp than another watcher already saw', async () => {
    const page = join(folder, 'run.html')
    await fs.writeFile(page, 'one')
    const before = await watched(page)
    await fs.writeFile(page, 'two!')
    watches.set('tab', [await watched(page)])
    watches.set('pop-out', [before])
    await quiet()
    expect(changes).toEqual(['pop-out'])
  })

  it('tells every watcher of the file, and releases the watch once no one shows it', async () => {
    const page = join(folder, 'run.html')
    await fs.writeFile(page, 'one')
    watches.set('tab', [await watched(page)])
    watches.set('pop-out', [await watched(page)])
    await fs.writeFile(page, 'two!')
    await quiet()
    expect(changes.sort()).toEqual(['pop-out', 'tab'])

    watches.release('tab')
    expect(watches.watched()).toEqual([page])
    watches.set('pop-out', [await watched(join(folder, 'other.md'))])
    expect(watches.watched()).toEqual([join(folder, 'other.md')])
    watches.release('pop-out')
    expect(watches.watched()).toEqual([])

    changes = []
    await fs.writeFile(page, 'three!!')
    await quiet()
    expect(changes).toEqual([])
  })
})
