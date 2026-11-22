import { describe, expect, it } from 'vitest'
import { launchesCode, resolveLinkedPath } from './links'

const CWD = 'C:\\work\\repo'

function existing(...paths: string[]): (p: string) => boolean {
  const set = new Set(paths.map((p) => p.toLowerCase()))
  return (p) => set.has(p.toLowerCase())
}

describe('where a file link points', () => {
  it('resolves a relative path against the chat workspace', () => {
    expect(resolveLinkedPath(CWD, 'Logs/shot.png', existing('C:\\work\\repo\\Logs\\shot.png'))).toEqual({
      path: 'C:\\work\\repo\\Logs\\shot.png',
      relative: 'Logs/shot.png'
    })
  })

  it('opens an absolute path outside the workspace only when it exists', () => {
    expect(resolveLinkedPath(CWD, 'D:/art/ref.png', existing('D:\\art\\ref.png'))).toEqual({ path: 'D:\\art\\ref.png', relative: null })
    expect(resolveLinkedPath(CWD, 'D:/art/missing.png', existing())).toBeNull()
  })

  it('gives an absolute path inside the workspace its relative path too', () => {
    expect(resolveLinkedPath(CWD, 'c:/work/repo/src/a.ts', existing('C:\\work\\repo\\src\\a.ts'))?.relative).toBe('src/a.ts')
  })

  it('tries a missing rooted path as two folders plus a path in the workspace, as the extension does', () => {
    expect(resolveLinkedPath(CWD, '/home/me/src/a.ts', existing('C:\\work\\repo\\src\\a.ts'))?.path).toBe('C:\\work\\repo\\src\\a.ts')
  })

  it('is null for a relative path that does not exist', () => {
    expect(resolveLinkedPath(CWD, 'nope.ts', existing())).toBeNull()
  })

  it('does not resolve a relative path when the chat has no workspace', () => {
    expect(resolveLinkedPath('', 'package.json', () => true)).toBeNull()
  })
})

describe('what a file link may hand to the system', () => {
  it('never starts a program or script', () => {
    for (const p of ['C:\\x\\setup.exe', 'a.msi', 'run.BAT', 'x.cmd', 'y.ps1', 'z.lnk', 'w.vbs', 'app.jar', 'h.hta', 'q.scr', 'r.com', 's.dll']) {
      expect(launchesCode(p)).toBe(true)
    }
  })

  it('opens documents and media', () => {
    for (const p of ['a.pdf', 'b.zip', 'c.mp4', 'd.docx', 'folder']) expect(launchesCode(p)).toBe(false)
  })
})
