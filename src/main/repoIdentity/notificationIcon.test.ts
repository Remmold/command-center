import { describe, expect, it } from 'vitest'
import type { RepoIdentities } from '../../shared/repoIdentity'
import { chooseNotificationIcon } from './notificationIcon'

const KEY = 'git:c:/projects/darkfall/.git'
const PNG = 'ab12ab12ab12ab12.png'
const workspaces = [{ path: 'C:\\projects\\darkfall', repoGroupKey: KEY }]

function choose(cwd: string, identities: RepoIdentities, { rendered = [KEY], images = [PNG] } = {}) {
  return chooseNotificationIcon({
    cwd,
    workspaces,
    identities,
    hasRendered: (key) => rendered.includes(key),
    imageExists: (file) => images.includes(file)
  })
}

describe('chooseNotificationIcon', () => {
  it('uses a custom PNG as it is', () => {
    const identities = { [KEY]: { icon: { kind: 'image', file: PNG } } } as const
    expect(choose('c:/projects/darkfall/', identities)).toEqual({ kind: 'image', file: PNG })
  })

  it.each([
    ['a built-in icon', { icon: { kind: 'builtin', name: 'rocket', accent: 'teal' } }],
    ['a custom SVG', { icon: { kind: 'image', file: 'ab12ab12ab12ab12.svg' } }],
    ['no chosen icon', {}]
  ] as const)('uses the picture the app drew for %s', (_case, identity) => {
    expect(choose('C:\\projects\\darkfall', { [KEY]: identity })).toEqual({ kind: 'rendered', repoGroupKey: KEY })
  })

  it('uses the drawn letter when a custom PNG has gone missing from disk', () => {
    const identities = { [KEY]: { icon: { kind: 'image', file: PNG } } } as const
    expect(choose('C:\\projects\\darkfall', identities, { images: [] })).toEqual({ kind: 'rendered', repoGroupKey: KEY })
  })

  it('falls back to the app icon until the app has drawn the picture', () => {
    expect(choose('C:\\projects\\darkfall', {}, { rendered: [] })).toEqual({ kind: 'app' })
  })

  it('falls back to the app icon for a session outside every workspace', () => {
    expect(choose('C:\\elsewhere', {})).toEqual({ kind: 'app' })
  })
})
