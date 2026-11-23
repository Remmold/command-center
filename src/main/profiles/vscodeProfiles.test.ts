import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { folderFromUri, parseJsonc, readVsCodeConfigDirs, readVsCodeFolderAccounts, vscodeUserDir } from './vscodeProfiles'
import { vscodeFolderFor } from '../../shared/vscodeMatch'

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

describe('folderFromUri', () => {
  it('decodes a VS Code folder URI to a Windows path', () => {
    expect(folderFromUri('file:///c%3A/projects/work/continuum')).toBe('c:\\projects\\work\\continuum')
    expect(folderFromUri('file:///c%3A/My%20Projects/a%23b')).toBe('c:\\My Projects\\a#b')
  })

  it('reads a network share', () => {
    expect(folderFromUri('file://server/share/repo')).toBe('\\\\server\\share\\repo')
  })

  it('ignores remote and malformed URIs', () => {
    expect(folderFromUri('vscode-remote://wsl%2Bubuntu/home/me')).toBeNull()
    expect(folderFromUri('file:///c%3A/bad%E0%A4%A')).toBeNull()
  })
})

describe('readVsCodeFolderAccounts', () => {
  let userDir: string
  const home = 'C:/Users/me/.claude'
  const work = 'C:/Users/me/.claude-work'

  const write = (rel: string, value: unknown): void => {
    const file = join(userDir, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const configDirSetting = (dir: string) => ({ 'claudeCode.environmentVariables': [{ name: 'CLAUDE_CONFIG_DIR', value: dir }] })
  const storage = (workspaces: Record<string, string>) => ({
    userDataProfiles: [
      { location: 'builtin/agents', name: 'Agents', useDefaultFlags: { settings: true } },
      { location: '67c1b132', name: 'Work' },
      { location: 'ee55', name: 'Plain' }
    ],
    profileAssociations: { workspaces }
  })

  beforeEach(() => {
    userDir = mkdtempSync(join(tmpdir(), 'cc-vscode-'))
    write('profiles/67c1b132/settings.json', configDirSetting(work))
    write('profiles/ee55/settings.json', '{ "editor.fontSize": 14 }')
  })
  afterEach(() => rmSync(userDir, { recursive: true, force: true }))

  it('answers which Claude folder VS Code uses for an associated folder, by exact path in any case', async () => {
    write(
      'globalStorage/storage.json',
      storage({
        'file:///c%3A/projects/work/continuum': '67c1b132',
        'file:///c%3A/projects/personal/command-center': '__default__profile__'
      })
    )
    const found = await readVsCodeFolderAccounts(userDir, home)
    expect(vscodeFolderFor('C:\\Projects\\Work\\Continuum\\', found)).toEqual({ folder: 'c:\\projects\\work\\continuum', profileName: 'Work', configDir: work })
    expect(vscodeFolderFor('c:\\projects\\personal\\command-center', found)?.configDir).toBe(home)
    expect(vscodeFolderFor('c:\\projects\\work\\continuum\\packages\\api', found)).toBeUndefined()
    expect(vscodeFolderFor('c:\\projects\\work', found)).toBeUndefined()
  })

  it('gives the default profile its own CLAUDE_CONFIG_DIR when it sets one, and so to profiles that share its settings', async () => {
    write('settings.json', configDirSetting('D:/claude-default'))
    write(
      'globalStorage/storage.json',
      storage({ 'file:///d%3A/a': '__default__profile__', 'file:///d%3A/b': 'builtin/agents', 'file:///d%3A/c': 'ee55' })
    )
    const found = await readVsCodeFolderAccounts(userDir, home)
    expect(found.map((f) => [f.folder, f.profileName, f.configDir])).toEqual([
      ['d:\\a', 'Default', 'D:/claude-default'],
      ['d:\\b', 'Agents', 'D:/claude-default'],
      ['d:\\c', 'Plain', home]
    ])
  })

  it('skips folders tied to a profile VS Code no longer has', async () => {
    write('globalStorage/storage.json', storage({ 'file:///d%3A/gone': 'ff66', 'vscode-remote://wsl/x': '67c1b132' }))
    expect(await readVsCodeFolderAccounts(userDir, home)).toEqual([])
  })

  it('finds nothing when storage.json is missing or broken', async () => {
    expect(await readVsCodeFolderAccounts(userDir, home)).toEqual([])
    write('globalStorage/storage.json', '{ "profileAssociations": ')
    expect(await readVsCodeFolderAccounts(userDir, home)).toEqual([])
    write('globalStorage/storage.json', { profileAssociations: { workspaces: ['file:///d%3A/a'] } })
    expect(await readVsCodeFolderAccounts(userDir, home)).toEqual([])
  })
})
