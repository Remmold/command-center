import { describe, expect, it } from 'vitest'
import { repoGroupHue } from './repoGroups'
import { iconOrigin, resolveRepoIcon, type RepoIdentityView } from './repoIdentity'

const KEY = 'git:c:/projects/darkfall/.git'

describe('resolveRepoIcon', () => {
  it('shows the first letter of the repo name on the hashed colour when no icon is chosen', () => {
    expect(resolveRepoIcon({ repoGroupKey: KEY, repoName: 'darkfall' })).toEqual({
      kind: 'letter',
      letter: 'D',
      hue: repoGroupHue(KEY)
    })
  })
})

describe('resolveRepoIcon with a chosen icon', () => {
  it('uses the built-in icon on its accent colour', () => {
    const identity = { icon: { kind: 'builtin', name: 'rocket', accent: 'teal' } } as const
    expect(resolveRepoIcon({ repoGroupKey: KEY, repoName: 'darkfall', identity })).toEqual({
      kind: 'builtin',
      name: 'rocket',
      color: '#0d9488'
    })
  })

  it('shows a custom image from its loaded data', () => {
    const identity = { icon: { kind: 'image', file: 'ab12.png' }, imageUrl: 'data:image/png;base64,AAAA' } as const
    expect(resolveRepoIcon({ repoGroupKey: KEY, repoName: 'darkfall', identity })).toEqual({
      kind: 'image',
      src: 'data:image/png;base64,AAAA'
    })
  })

  it('falls back to the letter while a custom image has not loaded', () => {
    const identity = { icon: { kind: 'image', file: 'ab12.png' } } as const
    expect(resolveRepoIcon({ repoGroupKey: KEY, repoName: 'darkfall', identity }).kind).toBe('letter')
  })

  it('takes the letter from the display name', () => {
    const spec = resolveRepoIcon({ repoGroupKey: KEY, repoName: 'darkfall', identity: { displayName: ' mmorpg' } })
    expect(spec).toMatchObject({ kind: 'letter', letter: 'M' })
  })
})

describe('resolveRepoIcon with icons found in the repo', () => {
  const found = [
    { file: 'aa11.png', path: 'brand/app-icon-1024.png', source: 'file', url: 'data:image/png;base64,AUTO' },
    { file: 'bb22.svg', path: 'public/favicon.svg', source: 'file', url: 'data:image/svg+xml;base64,FAV' }
  ] as const

  it('uses the best found icon when the user picked none', () => {
    expect(resolveRepoIcon({ repoGroupKey: KEY, repoName: 'darkfall', identity: { found: [...found] } })).toEqual({
      kind: 'image',
      src: 'data:image/png;base64,AUTO'
    })
  })

  it('keeps the user’s own icon over a found one', () => {
    const identity: RepoIdentityView = { icon: { kind: 'builtin', name: 'rocket', accent: 'teal' }, found: [...found] }
    expect(resolveRepoIcon({ repoGroupKey: KEY, repoName: 'darkfall', identity }).kind).toBe('builtin')
  })

  it('shows the letter when the user chose the letter, even with icons found', () => {
    const identity: RepoIdentityView = { icon: { kind: 'letter' }, found: [...found] }
    expect(resolveRepoIcon({ repoGroupKey: KEY, repoName: 'darkfall', identity })).toMatchObject({ kind: 'letter', letter: 'D' })
  })
})

describe('iconOrigin', () => {
  const found = [{ file: 'aa11.png', path: 'icon.png', source: 'file', url: 'data:,' }] as const

  it('says automatic for a found icon in use, picked for the user’s own, letter otherwise', () => {
    expect(iconOrigin({ found: [...found] })).toBe('automatic')
    expect(iconOrigin({ icon: { kind: 'image', file: 'aa11.png' }, imageUrl: 'data:,', found: [...found] })).toBe('picked')
    expect(iconOrigin({ icon: { kind: 'letter' }, found: [...found] })).toBe('letter')
    expect(iconOrigin({ found: [] })).toBe('letter')
    expect(iconOrigin(undefined)).toBe('letter')
  })
})
