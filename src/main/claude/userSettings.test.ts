import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mergeModelDefaults, parseModelDefaults, readModelDefaults, saveModelDefaults } from './userSettings'

describe('mergeModelDefaults', () => {
  it('sets the model and keeps every other key', () => {
    const before = JSON.stringify({ theme: 'dark', permissions: { allow: ['Read'] }, model: 'sonnet' })
    const result = mergeModelDefaults(before, { model: 'opus' })
    expect(result.ok && JSON.parse(result.text)).toEqual({ theme: 'dark', permissions: { allow: ['Read'] }, model: 'opus' })
  })

  it('removes the model key for Default, so the CLI chooses', () => {
    const result = mergeModelDefaults('{"model":"opus","theme":"dark"}', { model: null })
    expect(result.ok && JSON.parse(result.text)).toEqual({ theme: 'dark' })
  })

  it('saves effort per model under modelSettings, like the CLI, keeping other models', () => {
    const before = JSON.stringify({ modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'low', other: 1 } } })
    const result = mergeModelDefaults(before, { effort: { resolvedModel: 'claude-opus-5-5', level: 'high' } })
    expect(result.ok && JSON.parse(result.text)).toEqual({
      modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'low', other: 1 }, 'claude-opus-5-5': { effortLevel: 'high' } }
    })
  })

  it('never saves Max, which applies to the current session only', () => {
    const result = mergeModelDefaults('{"theme":"dark"}', { effort: { resolvedModel: 'claude-opus-5-5', level: 'max' } })
    expect(result.ok && JSON.parse(result.text)).toEqual({ theme: 'dark' })
  })

  it('starts a file that does not exist yet', () => {
    const result = mergeModelDefaults(null, { model: 'haiku' })
    expect(result.ok && JSON.parse(result.text)).toEqual({ model: 'haiku' })
  })

  it('refuses a file it cannot parse, or one that is not an object', () => {
    expect(mergeModelDefaults('{ "theme": ', { model: 'opus' }).ok).toBe(false)
    expect(mergeModelDefaults('[1, 2]', { model: 'opus' }).ok).toBe(false)
  })
})

describe('parseModelDefaults', () => {
  it('reads the model and the saved effort per model', () => {
    const text = JSON.stringify({ model: 'opus', modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' }, junk: 3 } })
    expect(parseModelDefaults(text)).toEqual({ model: 'opus', effortByModel: { 'claude-opus-5-5': 'xhigh' } })
  })

  it('has no defaults for a missing or broken file', () => {
    expect(parseModelDefaults(null)).toEqual({ effortByModel: {} })
    expect(parseModelDefaults('nope')).toEqual({ effortByModel: {} })
  })
})

describe('saving to the settings file', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'cc-settings-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes in place, so a profile hard-linked to the file sees the change', async () => {
    const file = join(dir, 'settings.json')
    const linked = join(dir, 'linked.json')
    await fs.writeFile(file, '{"theme":"dark"}')
    await fs.link(file, linked)
    expect(await saveModelDefaults(file, { model: 'opus' })).toEqual({ ok: true })
    expect(JSON.parse(await fs.readFile(linked, 'utf-8'))).toEqual({ theme: 'dark', model: 'opus' })
    expect(await readModelDefaults(linked)).toEqual({ model: 'opus', effortByModel: {} })
  })

  it('leaves an unparseable file untouched and reports it', async () => {
    const file = join(dir, 'settings.json')
    await fs.writeFile(file, '{ broken')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await saveModelDefaults(file, { model: 'opus' })
    expect(result.ok).toBe(false)
    expect(await fs.readFile(file, 'utf-8')).toBe('{ broken')
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('applies saves made together one after the other', async () => {
    const file = join(dir, 'settings.json')
    await Promise.all([
      saveModelDefaults(file, { model: 'opus' }),
      saveModelDefaults(file, { effort: { resolvedModel: 'claude-opus-5-5', level: 'low' } })
    ])
    expect(await readModelDefaults(file)).toEqual({ model: 'opus', effortByModel: { 'claude-opus-5-5': 'low' } })
  })
})
