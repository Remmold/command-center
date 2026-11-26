import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPatch, readSettingsFile, saveSettingsFile, settingsTargetProblem } from './settingsFile'

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
      'C:\\projects\\app\\.claude\\keybindings.json',
      'C:\\projects\\other\\.claude\\settings.json',
      'C:\\projects\\app\\.claude\\..\\..\\other\\.claude\\settings.json',
      'settings.json'
    ]) {
      expect(await settingsTargetProblem(path, known), path).toEqual(expect.any(String))
    }
  })
})
