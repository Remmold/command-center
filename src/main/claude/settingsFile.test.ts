import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPatch, readOrganisationLayer, readSettingsFile, saveSettingsFile, settingsTargetProblem } from './settingsFile'

const text = (value: unknown): string => JSON.stringify(value, null, 2) + '\n'

describe('applyPatch', () => {
  it('sets, replaces and removes nested keys and leaves every other key, its value and order alone', () => {
    const before = text({ zeta: 1, permissions: { allow: ['Read'], defaultMode: 'plan' }, model: 'sonnet', unknown: { deep: [1, 2] } })
    const result = applyPatch(before, null, {
      set: { model: 'opus', 'permissions.defaultMode': 'acceptEdits', 'modelSettings.claude-opus-5-5.effortLevel': 'high' },
      remove: ['permissions.allow', 'notThere.at.all']
    })
    expect(result).toEqual({
      ok: true,
      text: text({
        zeta: 1,
        permissions: { defaultMode: 'acceptEdits' },
        model: 'opus',
        unknown: { deep: [1, 2] },
        modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' } }
      })
    })
  })

  it('removes an object its last key was removed from, and its parent when that empties too, but keeps an empty object it did not touch', () => {
    const before = text({
      modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' }, 'claude-sonnet-5': { effortLevel: 'low', other: 1 } },
      kept: {}
    })
    const one = applyPatch(before, null, { set: {}, remove: ['modelSettings.claude-opus-5-5.effortLevel', 'modelSettings.claude-sonnet-5.effortLevel'] })
    expect(one).toEqual({ ok: true, text: text({ modelSettings: { 'claude-sonnet-5': { other: 1 } }, kept: {} }) })

    const last = applyPatch(text({ modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' } }, kept: {} }), null, {
      set: {},
      remove: ['modelSettings.claude-opus-5-5.effortLevel']
    })
    expect(last).toEqual({ ok: true, text: text({ kept: {} }) })
  })

  it('leaves the parent alone when the removed key is only inherited, such as constructor', () => {
    expect(applyPatch(text({ a: {} }), null, { set: {}, remove: ['a.constructor'] })).toEqual({ ok: true, text: text({ a: {} }) })
  })

  it('returns the patched keys Claude changed since the base was read, and applies nothing', () => {
    const base = { model: 'sonnet', permissions: { allow: ['Read'] }, theme: 'dark' }
    const onDisk = text({ model: 'haiku', permissions: { allow: ['Read', 'Bash(git status)'] }, theme: 'light' })
    const result = applyPatch(onDisk, base, { set: { model: 'opus', theme: 'light' }, remove: ['permissions.allow'] })
    expect(result).toEqual({ ok: false, conflicts: ['model', 'permissions.allow'] })
  })

  it('has no conflict where only unpatched keys changed on disk', () => {
    const onDisk = text({ model: 'sonnet', permissions: { allow: ['Read', 'Edit'] } })
    expect(applyPatch(onDisk, { model: 'sonnet', permissions: { allow: ['Read'] } }, { set: { model: 'opus' }, remove: [] })).toEqual({
      ok: true,
      text: text({ model: 'opus', permissions: { allow: ['Read', 'Edit'] } })
    })
  })

  it('adds and removes single rules on the list as it is on disk, keeping a rule Claude added meanwhile without a conflict', () => {
    const base = { permissions: { allow: ['Read', 'Edit'], deny: ['WebSearch'] } }
    const onDisk = text({ permissions: { allow: ['Bash(git status)', 'Read', 'Edit'], deny: ['WebSearch'] } })
    const result = applyPatch(onDisk, base, {
      set: {},
      remove: [],
      items: { 'permissions.allow': { add: ['Write', 'Read'], remove: ['Edit'] }, 'permissions.ask': { add: ['Edit'], remove: [] } }
    })
    expect(result).toEqual({ ok: true, text: text({ permissions: { allow: ['Bash(git status)', 'Read', 'Write'], deny: ['WebSearch'], ask: ['Edit'] } }) })
  })

  it('removes a list its last rule was removed from, and the parent that empties with it', () => {
    const onDisk = text({ permissions: { deny: ['WebSearch'] }, model: 'opus' })
    const result = applyPatch(onDisk, { permissions: { deny: ['WebSearch'] } }, { set: {}, remove: [], items: { 'permissions.deny': { add: [], remove: ['WebSearch'] } } })
    expect(result).toEqual({ ok: true, text: text({ model: 'opus' }) })
  })

  it('refuses a file that does not parse or is not an object', () => {
    expect(applyPatch('{ "model": ', {}, { set: { model: 'opus' }, remove: [] })).toMatchObject({ ok: false, error: expect.stringContaining('not valid JSON') })
    expect(applyPatch('[1, 2]', null, { set: { model: 'opus' }, remove: [] })).toEqual({ ok: false, error: 'not a JSON object' })
  })
})

describe('saving a settings file', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'cc-settings-file-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes in place, so a second hard link to the file sees the change', async () => {
    const file = join(dir, 'settings.json')
    const linked = join(dir, 'linked.json')
    await fs.writeFile(file, '{"theme":"dark"}')
    await fs.link(file, linked)
    const { value } = await readSettingsFile(file)
    const result = await saveSettingsFile(file, value, { set: { model: 'opus' }, remove: [] })
    expect(result).toMatchObject({ ok: true, snapshot: { value: { theme: 'dark', model: 'opus' } } })
    expect(await fs.readFile(linked, 'utf-8')).toBe(text({ theme: 'dark', model: 'opus' }))
  })

  it('creates a missing file and its .claude folder', async () => {
    const file = join(dir, 'repo', '.claude', 'settings.local.json')
    const before = await readSettingsFile(file)
    expect(before).toEqual({ value: {}, text: null, mtime: null })
    expect(await saveSettingsFile(file, before.value, { set: { model: 'haiku' }, remove: [] })).toMatchObject({ ok: true })
    expect(await fs.readFile(file, 'utf-8')).toBe(text({ model: 'haiku' }))
  })

  it('never writes a file that does not parse, and reads it with its parse message', async () => {
    const file = join(dir, 'settings.json')
    await fs.writeFile(file, '{ broken')
    const snapshot = await readSettingsFile(file)
    expect(snapshot).toMatchObject({ value: null, text: '{ broken', error: expect.stringContaining('not valid JSON') })
    expect(await saveSettingsFile(file, {}, { set: { model: 'opus' }, remove: [] })).toMatchObject({ ok: false, error: expect.any(String) })
    expect(await fs.readFile(file, 'utf-8')).toBe('{ broken')
  })

  it('writes nothing when a patched key changed on disk since the base was read', async () => {
    const file = join(dir, 'settings.json')
    await fs.writeFile(file, '{"model":"sonnet"}')
    const { value } = await readSettingsFile(file)
    await fs.writeFile(file, '{"model":"haiku"}')
    expect(await saveSettingsFile(file, value, { set: { model: 'opus' }, remove: [] })).toEqual({ ok: false, conflicts: ['model'] })
    expect(await fs.readFile(file, 'utf-8')).toBe('{"model":"haiku"}')
  })
})

describe('keybindings.json', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'cc-keybindings-file-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  const kb = (bindings: unknown[], top: Record<string, unknown> = {}) => text({ $schema: 'https://www.schemastore.org/claude-code-keybindings.json', ...top, bindings })

  it('reads as keys per context, a missing file as all defaults, and saves a new file with its schema line', async () => {
    const file = join(dir, 'keybindings.json')
    const missing = await readSettingsFile(file)
    expect(missing).toEqual({ value: {}, text: null, mtime: null })
    const result = await saveSettingsFile(file, missing.value, { set: { 'bindings.Chat.ctrl+e': 'chat:externalEditor', 'bindings.Chat.ctrl+s': null }, remove: [] })
    expect(result).toMatchObject({ ok: true, snapshot: { value: { bindings: { Chat: { 'ctrl+e': 'chat:externalEditor', 'ctrl+s': null } } } } })
    expect(await fs.readFile(file, 'utf-8')).toBe(
      text({
        $schema: 'https://www.schemastore.org/claude-code-keybindings.json',
        $docs: 'https://code.claude.com/docs/en/keybindings',
        bindings: [{ context: 'Chat', bindings: { 'ctrl+e': 'chat:externalEditor', 'ctrl+s': null } }]
      })
    )
  })

  it('changes keys in the blocks that hold them, adds new keys to the last block of their context and new contexts at the end, and drops a block it empties', async () => {
    const file = join(dir, 'keybindings.json')
    await fs.writeFile(
      file,
      kb(
        [
          { context: 'Chat', bindings: { 'ctrl+e': 'chat:externalEditor', 'ctrl+s': null } },
          { context: 'Task', bindings: { 'ctrl+x ctrl+b': null } },
          { context: 'Chat', bindings: { 'meta+g': 'command:compact' } },
          { context: 'Future', bindings: {} }
        ],
        { unknownTop: 1 }
      )
    )
    const { value } = await readSettingsFile(file)
    expect(value).toEqual({
      $schema: 'https://www.schemastore.org/claude-code-keybindings.json',
      unknownTop: 1,
      bindings: { Chat: { 'ctrl+e': 'chat:externalEditor', 'ctrl+s': null, 'meta+g': 'command:compact' }, Task: { 'ctrl+x ctrl+b': null }, Future: {} }
    })
    const result = await saveSettingsFile(file, value, {
      set: { 'bindings.Chat.ctrl+e': 'chat:stash', 'bindings.Chat.ctrl+k ctrl+s': 'chat:submit', 'bindings.Global.ctrl+~1': 'app:redraw' },
      remove: ['bindings.Task.ctrl+x ctrl+b', 'bindings.Chat.ctrl+s']
    })
    expect(result).toMatchObject({ ok: true })
    expect(await fs.readFile(file, 'utf-8')).toBe(
      kb(
        [
          { context: 'Chat', bindings: { 'ctrl+e': 'chat:stash' } },
          { context: 'Chat', bindings: { 'meta+g': 'command:compact', 'ctrl+k ctrl+s': 'chat:submit' } },
          { context: 'Future', bindings: {} },
          { context: 'Global', bindings: { 'ctrl+.': 'app:redraw' } }
        ],
        { unknownTop: 1 }
      )
    )
  })

  it('writes nothing when a patched key changed on disk, nor to a file whose bindings are not context blocks', async () => {
    const file = join(dir, 'keybindings.json')
    await fs.writeFile(file, kb([{ context: 'Chat', bindings: { 'ctrl+e': 'chat:externalEditor' } }]))
    const { value } = await readSettingsFile(file)
    await fs.writeFile(file, kb([{ context: 'Chat', bindings: { 'ctrl+e': 'chat:stash' } }]))
    expect(await saveSettingsFile(file, value, { set: { 'bindings.Chat.ctrl+e': null }, remove: [] })).toEqual({ ok: false, conflicts: ['bindings.Chat.ctrl+e'] })

    const odd = kb([{ context: 'Chat', bindings: ['ctrl+e'] }])
    await fs.writeFile(file, odd)
    expect(await readSettingsFile(file)).toMatchObject({ value: null, error: expect.stringContaining('context') })
    expect(await saveSettingsFile(file, {}, { set: { 'bindings.Chat.ctrl+e': null }, remove: [] })).toMatchObject({ ok: false, error: expect.any(String) })
    expect(await fs.readFile(file, 'utf-8')).toBe(odd)
  })
})

describe('the organisation layer', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'cc-settings-org-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('is absent when neither file exists, or the cached remote settings are empty and there is no managed file', async () => {
    const remote = join(dir, 'remote-settings.json')
    const managed = join(dir, 'ClaudeCode', 'managed-settings.json')
    expect(await readOrganisationLayer(remote, managed)).toBeNull()
    await fs.writeFile(remote, '{}')
    expect(await readOrganisationLayer(remote, managed)).toBeNull()
  })

  it('is the remote settings when they set anything, else the managed file, as only the first source with a policy counts', async () => {
    const remote = join(dir, 'remote-settings.json')
    const managed = join(dir, 'managed-settings.json')
    await fs.writeFile(remote, '{}')
    await fs.writeFile(managed, '{"model":"sonnet"}')
    expect(await readOrganisationLayer(remote, managed)).toMatchObject({ path: managed, snapshot: { value: { model: 'sonnet' } } })
    await fs.writeFile(remote, '{"model":"haiku"}')
    expect(await readOrganisationLayer(remote, managed)).toMatchObject({ path: remote, snapshot: { value: { model: 'haiku' } } })
  })

  it('is a file that does not parse, with its parse message, so the page can say so', async () => {
    const remote = join(dir, 'remote-settings.json')
    await fs.writeFile(remote, '{ broken')
    expect(await readOrganisationLayer(remote, join(dir, 'managed-settings.json'))).toMatchObject({ path: remote, snapshot: { value: null, error: expect.stringContaining('not valid JSON') } })
  })
})

describe('settingsTargetProblem', () => {
  const known = { configDirs: ['C:\\Users\\a\\.claude', 'C:\\Users\\a\\.claude-work'], workspacePaths: ['C:\\projects\\app'] }

  it("allows each account's settings.json and keybindings.json, adopted folders included, and each workspace's two settings files", async () => {
    for (const path of [
      'C:\\Users\\a\\.claude\\settings.json',
      'c:/users/a/.claude-work/keybindings.json',
      'C:\\projects\\app\\.claude\\settings.json',
      'C:\\projects\\app\\.claude\\settings.local.json'
    ]) {
      expect(await settingsTargetProblem(path, known), path).toBeNull()
    }
  })

  it('refuses any other path, and the sign-in files', async () => {
    for (const path of [
      'C:\\Users\\a\\.claude\\.credentials.json',
      'C:\\Users\\a\\.claude.json',
      'C:\\Users\\a\\.claude\\settings.local.json',
      'C:\\Users\\a\\.claude-work\\.credentials.json',
      'C:\\Users\\a\\.claude-work\\CLAUDE.md',
      'C:\\Users\\a\\.claude-work\\projects\\settings.json',
      'C:\\projects\\app\\.claude\\keybindings.json',
      'C:\\projects\\other\\.claude\\settings.json',
      'C:\\projects\\app\\.claude\\..\\..\\other\\.claude\\settings.json',
      'settings.json'
    ]) {
      expect(await settingsTargetProblem(path, known), path).toEqual(expect.any(String))
    }
  })
})
