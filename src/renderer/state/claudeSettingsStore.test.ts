import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeSettingsRead } from '../../shared/claudeSettings'

const saved = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => void saved.set(key, value),
  removeItem: (key: string) => void saved.delete(key)
})
const save = vi.fn()
vi.stubGlobal('window', { api: { claudeSettings: { save }, claude: { readDefaults: vi.fn(async () => ({})) } } })

const { useClaudeSettingsStore } = await import('./claudeSettingsStore')

const PATH = 'C:/Users/me/.claude/settings.json'
const KEYS_PATH = 'C:/Users/me/.claude/keybindings.json'
const read: ClaudeSettingsRead = {
  account: { layer: 'account', path: PATH, profileId: 'default', snapshot: { value: { model: 'sonnet' }, text: '{}', mtime: 1 } },
  keybindings: { layer: 'account', path: KEYS_PATH, snapshot: { value: {}, text: null, mtime: null } },
  repo: null,
  local: null,
  organisation: null
}

const store = () => useClaudeSettingsStore.getState()

describe('saving Claude Code settings while a raw JSON box holds text', () => {
  beforeEach(() => {
    save.mockReset()
    save.mockResolvedValue({ ok: true, snapshot: { value: { model: 'opus' }, text: '{}', mtime: 2 } })
    useClaudeSettingsStore.setState({ layer: 'account', keybindings: false, read, pending: {}, unparsed: [], saving: false, saveError: null })
  })

  it('writes nothing while a box holds text that is not its value yet, and saves once the box is clean', async () => {
    store().stage('model', 'opus')
    store().markUnparsed('modelOverrides', true)
    await store().save()
    expect(save).not.toHaveBeenCalled()
    expect(store().unparsed).toEqual(['modelOverrides'])

    store().markUnparsed('modelOverrides', false)
    await store().save()
    expect(save).toHaveBeenCalledWith(PATH, { model: 'sonnet' }, { set: { model: 'opus' }, remove: [] })
  })

  it('asks before leaving while a box holds text, even with no change waiting', () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('window', { ...window, confirm })
    store().markUnparsed('modelOverrides', true)
    expect(store().confirmLeave()).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
  })
})

describe('key bindings', () => {
  beforeEach(() => {
    save.mockReset()
    useClaudeSettingsStore.setState({ layer: 'account', keybindings: false, read, pending: {}, unparsed: [], saving: false, saveError: null })
  })

  it('wait and save in the account’s keybindings.json while they are on screen, apart from the settings file’s changes', async () => {
    save.mockResolvedValue({ ok: true, snapshot: { value: { bindings: { Chat: { 'ctrl+s': null } } }, text: '{}', mtime: 2 } })
    store().stage('model', 'opus')
    store().showKeybindings(true)
    store().stage('bindings.Chat.ctrl+s', null)
    await store().save()
    expect(save).toHaveBeenCalledWith(KEYS_PATH, {}, { set: { 'bindings.Chat.ctrl+s': null }, remove: [] })
    expect(store().read?.keybindings.snapshot.value).toEqual({ bindings: { Chat: { 'ctrl+s': null } } })
    expect(store().read?.account.snapshot.value).toEqual({ model: 'sonnet' })
    expect(Object.keys(store().pending)).toEqual([PATH])
  })

  it('are off again when the section is left, so it reopens on the settings file', () => {
    store().showKeybindings(true)
    store().dropAll()
    expect(store().keybindings).toBe(false)
  })

  it('give way to the settings file on the Repo and Local layers', () => {
    store().showKeybindings(true)
    store().selectLayer('local')
    expect(store().keybindings).toBe(false)
  })
})
