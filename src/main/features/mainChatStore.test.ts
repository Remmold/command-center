import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMainChatStore } from './mainChatStore'

describe('the main chat store', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cc-mainchat-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('starts empty, so the default account runs it', async () => {
    expect(await createMainChatStore(join(dir, 'm.json')).get()).toEqual({})
  })

  it('keeps the Claude session id across a restart', async () => {
    const file = join(dir, 'm.json')
    await createMainChatStore(file).setClaudeSession('abc')
    expect(await createMainChatStore(file).get()).toEqual({ claudeSessionId: 'abc' })
  })

  it('a new account forgets the old conversation, which lives in the old account folder', async () => {
    const store = createMainChatStore(join(dir, 'm.json'))
    await store.setClaudeSession('abc')
    expect(await store.setProfile('work')).toEqual({ profileId: 'work' })
    expect(await store.setProfile('work')).toEqual({ profileId: 'work' })
  })

  it('a reset forgets the conversation and keeps the account; after a Go it remembers the feature, across a restart', async () => {
    const file = join(dir, 'm.json')
    const store = createMainChatStore(file)
    await store.setProfile('work')
    await store.setClaudeSession('abc')
    expect(await store.reset({ name: 'hello-footer', workspace: 'Test' })).toEqual({ profileId: 'work', justStarted: { name: 'hello-footer', workspace: 'Test' } })
    await store.setClaudeSession('fresh')
    expect(await createMainChatStore(file).get()).toEqual({ profileId: 'work', claudeSessionId: 'fresh', justStarted: { name: 'hello-footer', workspace: 'Test' } })
  })

  it('a plain reset clears the feature an earlier Go named, and a new account clears it too', async () => {
    const store = createMainChatStore(join(dir, 'm.json'))
    await store.reset({ name: 'a', workspace: 'w' })
    expect(await store.reset()).toEqual({})
    await store.reset({ name: 'a', workspace: 'w' })
    expect(await store.setProfile('work')).toEqual({ profileId: 'work' })
  })

  it('reads a broken file as empty', async () => {
    const file = join(dir, 'm.json')
    await import('node:fs').then((fs) => fs.writeFileSync(file, '{nope'))
    expect(await createMainChatStore(file).get()).toEqual({})
  })
})
