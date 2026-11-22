import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseJsonc, readVsCodeConfigDirs, vscodeUserDir } from './vscodeProfiles'

describe('parseJsonc', () => {
  it('reads comments and trailing commas as VS Code writes them', () => {
    const text = `{
      // a line comment
      "a": "http://x//not-a-comment", /* block */
      "b": [1, 2,],
      "c": "quote \\" // still a string",
      "d": "keeps ,} inside",
    }`
    expect(parseJsonc(text)).toEqual({ a: 'http://x//not-a-comment', b: [1, 2], c: 'quote " // still a string', d: 'keeps ,} inside' })
  })

  it('returns undefined for text that is not JSON', () => {
    expect(parseJsonc('{ "a": ')).toBeUndefined()
  })
})

describe('readVsCodeConfigDirs', () => {
  let userDir: string

  const write = (rel: string, text: string): void => {
    const file = join(userDir, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
  }
  const envSetting = (value: string, extra = ''): string => `{
    // VS Code keeps comments
    "editor.fontSize": 13,
    "claudeCode.environmentVariables": [
      { "name": "OTHER", "value": "x" },
      { "name": "CLAUDE_CONFIG_DIR", "value": ${JSON.stringify(value)} },
    ],${extra}
  }`

  beforeEach(() => {
    userDir = mkdtempSync(join(tmpdir(), 'cc-vscode-'))
  })
  afterEach(() => rmSync(userDir, { recursive: true, force: true }))

  it('finds nothing when VS Code is not there', async () => {
    expect(await readVsCodeConfigDirs(join(userDir, 'missing'))).toEqual([])
  })

  it('names each profile from storage.json and reads its CLAUDE_CONFIG_DIR', async () => {
    write('settings.json', envSetting('C:\\cfg\\default'))
    write('profiles/67c1b132/settings.json', envSetting('C:\\Users\\me\\.claude-work'))
    write('profiles/aa11/settings.json', envSetting('D:\\personal'))
    write('profiles/bb22/settings.json', '{ "editor.fontSize": 14, }')
    write(
      'globalStorage/storage.json',
      JSON.stringify({
        userDataProfiles: [
          { location: 'builtin/agents', name: 'Agents', useDefaultFlags: { settings: true } },
          { location: '67c1b132', name: 'Work' },
          { location: 'aa11', name: 'Personal' },
          { location: 'bb22', name: 'Plain' }
        ]
      })
    )
    expect(await readVsCodeConfigDirs(userDir)).toEqual([
      { profileName: 'Default', configDir: 'C:\\cfg\\default' },
      { profileName: 'Work', configDir: 'C:\\Users\\me\\.claude-work' },
      { profileName: 'Personal', configDir: 'D:\\personal' }
    ])
  })

  it('skips broken settings, relative paths and a profile folder with no name', async () => {
    write('settings.json', '{ "claudeCode.environmentVariables": ')
    write('profiles/cc33/settings.json', envSetting('relative\\dir'))
    write('profiles/dd44/settings.json', envSetting('E:\\unnamed'))
    expect(await readVsCodeConfigDirs(userDir)).toEqual([{ profileName: 'dd44', configDir: 'E:\\unnamed' }])
  })
})

describe('vscodeUserDir', () => {
  it('is VS Code’s own folder under APPDATA', () => {
    expect(vscodeUserDir({ APPDATA: 'C:\\Users\\me\\AppData\\Roaming' })).toBe(join('C:\\Users\\me\\AppData\\Roaming', 'Code', 'User'))
  })

  it('under the fake CLI, only a folder the test names, never the real one', () => {
    expect(vscodeUserDir({ APPDATA: 'C:\\real', CC_CLAUDE_BIN: 'fake.mjs' })).toBeNull()
    expect(vscodeUserDir({ APPDATA: 'C:\\real', CC_CLAUDE_BIN: 'fake.mjs', CC_VSCODE_USER_DIR: 'C:\\tmp\\vs' })).toBe('C:\\tmp\\vs')
  })
})
