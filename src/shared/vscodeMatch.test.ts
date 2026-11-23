import { describe, expect, it } from 'vitest'
import { accountMoves, joinNames, movesByAccount, preselectedProfile } from './vscodeMatch'

const HOME = 'C:\\Users\\me\\.claude'
const WORK = 'C:\\Users\\me\\.claude-work'

const profiles = [
  { id: 'default', configDir: HOME },
  { id: 'side', configDir: 'D:\\claude-side' }
]
const workspace = (id: string, path: string, profileId = 'default') => ({ id, name: id, path, profileId })
const folders = [
  { folder: 'c:\\projects\\work\\continuum', profileName: 'Work', configDir: WORK },
  { folder: 'c:\\projects\\work\\nordkastell', profileName: 'Work', configDir: 'c:/users/me/.claude-work/' },
  { folder: 'c:\\projects\\personal\\command-center', profileName: 'Default', configDir: HOME }
]

describe('accountMoves', () => {
  it('finds each workspace VS Code runs on a Claude folder the app does not use for it', () => {
    const moves = accountMoves({
      workspaces: [
        workspace('continuum', 'C:\\Projects\\Work\\Continuum\\'),
        workspace('nordkastell', 'c:\\projects\\work\\nordkastell', 'side'),
        workspace('command-center', 'c:\\projects\\personal\\command-center'),
        workspace('api', 'c:\\projects\\work\\continuum\\api')
      ],
      profiles,
      folders,
      dismissed: []
    })
    expect(moves.map((m) => [m.workspaceId, m.profileName, m.configDir])).toEqual([
      ['continuum', 'Work', WORK],
      ['nordkastell', 'Work', 'c:/users/me/.claude-work/']
    ])
  })

  it('finds nothing once the workspace runs on an account with that folder', () => {
    const moves = accountMoves({
      workspaces: [workspace('continuum', 'c:\\projects\\work\\continuum', 'work')],
      profiles: [...profiles, { id: 'work', configDir: 'c:\\users\\me\\.claude-work' }],
      folders,
      dismissed: []
    })
    expect(moves).toEqual([])
  })

  it('a workspace on a profile the app no longer has runs on Default', () => {
    const moves = accountMoves({
      workspaces: [workspace('command-center', 'c:\\projects\\personal\\command-center', 'deleted')],
      profiles,
      folders,
      dismissed: []
    })
    expect(moves).toEqual([])
  })

  it('remembers dismissed mismatches, and shows a new one again', () => {
    const input = { workspaces: [workspace('continuum', 'c:\\projects\\work\\continuum')], profiles, folders }
    const [first] = accountMoves({ ...input, dismissed: [] })
    expect(accountMoves({ ...input, dismissed: [first.key] })).toEqual([])

    const grown = accountMoves({
      ...input,
      workspaces: [...input.workspaces, workspace('nordkastell', 'c:\\projects\\work\\nordkastell')],
      dismissed: [first.key]
    })
    expect(grown.map((m) => m.workspaceId)).toEqual(['nordkastell'])

    const movedElsewhere = accountMoves({
      ...input,
      folders: [{ folder: 'c:\\projects\\work\\continuum', profileName: 'Other', configDir: 'E:\\other' }],
      dismissed: [first.key]
    })
    expect(movedElsewhere.map((m) => m.profileName)).toEqual(['Other'])
  })
})

describe('movesByAccount', () => {
  it('groups the workspace names under each VS Code account, in first-seen order', () => {
    const moves = accountMoves({
      workspaces: [
        workspace('continuum', 'c:\\projects\\work\\continuum'),
        workspace('x', 'd:\\x'),
        workspace('nordkastell', 'c:\\projects\\work\\nordkastell')
      ],
      profiles,
      folders: [...folders, { folder: 'd:\\x', profileName: 'Side', configDir: 'D:\\claude-side' }],
      dismissed: []
    })
    expect(movesByAccount(moves)).toEqual([
      { profileName: 'Work', workspaceNames: ['continuum', 'nordkastell'] },
      { profileName: 'Side', workspaceNames: ['x'] }
    ])
  })
})

describe('joinNames', () => {
  it('reads as a sentence', () => {
    expect(joinNames(['a'])).toBe('a')
    expect(joinNames(['a', 'b'])).toBe('a and b')
    expect(joinNames(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('preselectedProfile', () => {
  it('picks the account that uses the Claude folder VS Code uses for the folder', () => {
    const withWork = [...profiles, { id: 'work', configDir: WORK }]
    expect(preselectedProfile('C:\\projects\\work\\continuum', folders, withWork)).toBe('work')
    expect(preselectedProfile('c:\\projects\\personal\\command-center', folders, withWork)).toBe('default')
  })

  it('picks nothing when no account uses that folder yet, or VS Code ties no profile to it', () => {
    expect(preselectedProfile('c:\\projects\\work\\continuum', folders, profiles)).toBeUndefined()
    expect(preselectedProfile('c:\\elsewhere', folders, profiles)).toBeUndefined()
  })
})
