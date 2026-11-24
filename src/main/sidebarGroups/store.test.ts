import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSidebarGroupsStore, type SidebarGroupsStore } from './store'

let root: string
let store: SidebarGroupsStore

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'cc-sidebar-'))
  store = createSidebarGroupsStore(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const LAYOUT = {
  accounts: {
    default: {
      ungrouped: ['pane:n'],
      ungroupedFolded: false,
      groups: [{ id: 'g1', name: 'Today', folded: true, chats: ['pane:a', 'session:b'] }],
      known: { 'pane:a': { seen: 3, session: 's-a' }, 'pane:n': { seen: 3 }, 'session:b': { seen: 2, session: 'b' } }
    }
  }
}

describe('sidebar groups store', () => {
  it('has no layout before one is saved, so the first start seeds it', async () => {
    expect(await store.load()).toBeNull()
  })

  it('keeps a saved layout across a restart, leaving no temp file behind', async () => {
    await store.save(LAYOUT)
    expect(await createSidebarGroupsStore(root).load()).toEqual(LAYOUT)
    expect(await fs.readdir(root)).toEqual(['sidebar-groups.json'])
  })

  it('writes saves in the order they came', async () => {
    const later = { accounts: { default: { ...LAYOUT.accounts.default, ungrouped: [] } } }
    await Promise.all([store.save(LAYOUT), store.save(later)])
    expect(await store.load()).toEqual(later)
  })

  it('drops malformed parts and refuses to save a non-layout', async () => {
    await fs.writeFile(join(root, 'sidebar-groups.json'), JSON.stringify({ accounts: { default: { groups: [{ id: 'g', name: 'G', chats: ['x', 'x', 4] }, { name: 'no id' }], ungrouped: ['x'] } } }))
    expect(await store.load()).toEqual({ accounts: { default: { ungrouped: ['x'], ungroupedFolded: false, groups: [{ id: 'g', name: 'G', folded: false, chats: [] }], known: {} } } })
    await expect(store.save('nope')).rejects.toThrow()
  })
})
