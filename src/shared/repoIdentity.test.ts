import { describe, expect, it } from 'vitest'
import { repoGroupHue } from './repoGroups'
import { resolveRepoIcon } from './repoIdentity'

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
