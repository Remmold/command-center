import { describe, expect, it } from 'vitest'
import { removalConfirmText } from '../../shared/profiles'
import { DEFAULT_PROFILE_ID } from '../../shared/types'
import { adoptionProblem, adoptedName, linksAllowed, removeSaved, suggestionsFrom } from './adopt'

const USED = [
  { name: 'Default', configDir: 'C:\\Users\\me\\.claude' },
  { name: 'Spare', configDir: 'C:\\data\\profiles\\abc' }
]
const ROOT = 'C:\\data\\profiles'

describe('adoptionProblem', () => {
  const check = (path: string, kind: 'folder' | 'file' | 'missing' = 'folder') =>
    adoptionProblem({ path, kind, used: USED, appProfilesRoot: ROOT })

  it('accepts an existing folder no profile uses', () => {
    expect(check('C:\\Users\\me\\.claude-work')).toBeNull()
  })

  it('refuses a folder a profile already uses, however it is spelled', () => {
    expect(check('c:/users/me/.claude/')).toBe('Default already uses this folder.')
  })

  it('refuses a folder inside or around another profile’s folder', () => {
    expect(check('C:\\Users\\me\\.claude\\projects')).toBe('That folder overlaps the folder of Default.')
    expect(check('C:\\Users\\me')).toBe('That folder overlaps the folder of Default.')
  })

  it('refuses a missing folder, a file, a relative path and the app’s own profile folders', () => {
    expect(check('C:\\nope', 'missing')).toBe('That folder does not exist.')
    expect(check('C:\\a.txt', 'file')).toBe('That is a file, not a folder.')
    expect(check('relative\\dir')).toBe('Pick a full path.')
    expect(check('C:\\data\\profiles\\other')).toBe('That folder belongs to a profile the app made.')
    expect(check('C:\\data\\profiles')).toBe('That folder belongs to a profile the app made.')
  })
})

describe('suggestionsFrom', () => {
  it('offers each VS Code folder once, leaving out folders a profile uses', () => {
    const found = [
      { profileName: 'Default', configDir: 'C:\\Users\\me\\.claude' },
      { profileName: 'Work', configDir: 'C:\\Users\\me\\.claude-work' },
      { profileName: 'Work copy', configDir: 'c:\\users\\me\\.claude-work\\' }
    ]
    expect(suggestionsFrom(found, USED)).toEqual([{ profileName: 'Work', configDir: 'C:\\Users\\me\\.claude-work' }])
  })
})

describe('adoptedName', () => {
  it('takes the VS Code profile’s name for a folder it uses, else the folder’s name', () => {
    const found = [{ profileName: 'Work', configDir: 'C:\\Users\\me\\.claude-work' }]
    expect(adoptedName('c:/users/me/.claude-work', found)).toBe('Work')
    expect(adoptedName('D:\\accounts\\side-project\\', found)).toBe('side-project')
  })

  it('never names it Default, which the built-in profile already is', () => {
    expect(adoptedName('C:\\cfg\\vs-default', [{ profileName: 'Default', configDir: 'C:\\cfg\\vs-default' }])).toBe('vs-default')
  })
})

describe('an adopted folder is never touched', () => {
  it('gets no shared-item links; a folder the app made does, and Default never does', () => {
    expect(linksAllowed({ id: 'a', adopted: true })).toBe(false)
    expect(linksAllowed({ id: 'b', adopted: false })).toBe(true)
    expect(linksAllowed({ id: DEFAULT_PROFILE_ID, adopted: false })).toBe(false)
  })

  it('removing forgets the profile and keeps every other one', () => {
    const saved = [
      { id: 'a', name: 'Work', createdAt: 1, configDir: 'C:\\w' },
      { id: 'b', name: 'Spare', createdAt: 2 }
    ]
    expect(removeSaved(saved, 'a')).toEqual([saved[1]])
    expect(removeSaved(saved, 'zzz')).toEqual(saved)
  })

  it('says the folder stays on disk', () => {
    expect(removalConfirmText({ name: 'Work', configDir: 'C:\\Users\\me\\.claude-work' })).toBe(
      'Remove Work? Command Center forgets this account; the folder C:\\Users\\me\\.claude-work stays on disk, untouched. Workspaces that used it go back to the default account.'
    )
  })
})
