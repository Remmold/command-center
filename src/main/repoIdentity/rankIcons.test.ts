import { describe, expect, it } from 'vitest'
import { rankIconCandidates, type IconCandidate } from './rankIcons'

const file = (path: string, size?: number | [number, number]): IconCandidate => {
  const [width, height] = typeof size === 'number' ? [size, size] : (size ?? [undefined, undefined])
  return { path, source: 'file', ...(width !== undefined && { width, height }) }
}

const paths = (candidates: IconCandidate[]): string[] => rankIconCandidates(candidates, 'dark').map((c) => c.path)

describe('rankIconCandidates', () => {
  it('keeps only files named like app icons', () => {
    expect(
      paths([
        file('docs/screenshot.png', 800),
        file('src/assets/hero.svg'),
        file('public/favicon.svg'),
        file('brand/app-icon-1024.png', 1024),
        file('assets/icon.png', 256),
        file('img/logo.svg'),
        file('apple-touch-icon-180.png', 180),
        file('public/mstile-150x150.png', 150),
        file('src/icons/close-icon.png', 16)
      ]).sort()
    ).toEqual(
      ['apple-touch-icon-180.png', 'assets/icon.png', 'brand/app-icon-1024.png', 'img/logo.svg', 'public/favicon.svg', 'public/mstile-150x150.png'].sort()
    )
  })

  it('takes Electron build and resources icons by their folder', () => {
    expect(paths([file('build/icon.ico'), file('resources/icon-tray.png', 32), file('other/icon-tray.png', 32)]).sort()).toEqual([
      'build/icon.ico',
      'resources/icon-tray.png'
    ])
  })

  it('prefers a square PNG of at least 128 px, then SVG, then ICO, then a small or oblong PNG', () => {
    expect(
      paths([
        file('public/favicon.png', 32),
        file('public/favicon.ico'),
        file('public/favicon.svg'),
        file('public/apple-touch-icon.png', 180)
      ])
    ).toEqual(['public/apple-touch-icon.png', 'public/favicon.svg', 'public/favicon.ico', 'public/favicon.png'])
  })

  it('prefers the dark variant on the dark theme and the light one on the light theme', () => {
    const both = [file('brand/png/app-icon-light-1024.png', 1024), file('brand/png/app-icon-dark-1024.png', 1024), file('brand/png/app-icon-1024.png', 1024)]
    expect(rankIconCandidates(both, 'dark').map((c) => c.path)).toEqual([
      'brand/png/app-icon-dark-1024.png',
      'brand/png/app-icon-1024.png',
      'brand/png/app-icon-light-1024.png'
    ])
    expect(rankIconCandidates(both, 'light')[0].path).toBe('brand/png/app-icon-light-1024.png')
  })

  it('ranks a monorepo’s apps and packages below the root, apps in alphabetical order', () => {
    expect(
      paths([
        file('apps/marketing/public/favicon.svg'),
        file('packages/ui/assets/app-icon.png', 512),
        file('apps/dashboard/public/favicon.svg'),
        file('public/favicon.ico')
      ])
    ).toEqual(['public/favicon.ico', 'apps/dashboard/public/favicon.svg', 'apps/marketing/public/favicon.svg', 'packages/ui/assets/app-icon.png'])
  })

  it('puts named files first, then the Unity and Godot icons, then executables', () => {
    expect(
      paths([
        { path: 'RiseOfAgon.exe', source: 'exe' },
        { path: 'icon.svg', source: 'godot' },
        { path: 'Assets/Art/AppIcon.png', source: 'unity', width: 512, height: 512 },
        file('docs/favicon.png', 16)
      ])
    ).toEqual(['docs/favicon.png', 'Assets/Art/AppIcon.png', 'icon.svg', 'RiseOfAgon.exe'])
  })

  it('drops executables whose icon is only the generic Windows one', () => {
    expect(
      paths([
        { path: 'Build/Game.exe', source: 'exe', genericExeIcon: false },
        { path: 'tool.exe', source: 'exe', genericExeIcon: true }
      ])
    ).toEqual(['Build/Game.exe'])
  })

  it('lists root executables before those in build folders', () => {
    expect(
      paths([
        { path: 'Builds/Windows/Game.exe', source: 'exe' },
        { path: 'Run/Client.exe', source: 'exe' },
        { path: 'RiseOfAgon.exe', source: 'exe' }
      ])
    ).toEqual(['RiseOfAgon.exe', 'Run/Client.exe', 'Builds/Windows/Game.exe'])
  })

  it('counts an oblong PNG as a small one', () => {
    expect(paths([file('img/logo.png', [600, 200]), file('img/favicon.ico')])).toEqual(['img/favicon.ico', 'img/logo.png'])
  })

  it('among equally good images, follows the name order and then the larger size', () => {
    expect(paths([file('a/favicon.png', 512), file('a/icon.png', 256), file('a/app-icon.png', 128), file('b/app-icon.png', 1024)])).toEqual([
      'b/app-icon.png',
      'a/app-icon.png',
      'a/icon.png',
      'a/favicon.png'
    ])
  })
})
