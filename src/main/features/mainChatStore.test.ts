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

  it('reads a broken file as empty', async () => {
    const file = join(dir, 'm.json')
    await import('node:fs').then((fs) => fs.writeFileSync(file, '{nope'))
    expect(await createMainChatStore(file).get()).toEqual({})
  })
})
