import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAKE_BIN, assertFakeClaude, assertFakeModel3d, workerCrashWarning } from './guard'

describe('workerCrashWarning', () => {
  it.each(['v24.15.0', 'v24.0.0', 'v22.23.5', 'v20.19.0'])('warns for %s on Windows', (version) => {
    expect(workerCrashWarning(version, 'win32')).toMatch(/nodejs\/node#63620/)
  })

  it.each(['v24.16.0', 'v24.22.3', 'v26.1.0'])('is quiet for %s on Windows', (version) => {
    expect(workerCrashWarning(version, 'win32')).toBeUndefined()
  })

  it('is quiet off Windows', () => {
    expect(workerCrashWarning('v24.15.0', 'linux')).toBeUndefined()
  })
})

describe('assertFakeClaude', () => {
  it('accepts the repo fake', () => {
    expect(() => assertFakeClaude(FAKE_BIN)).not.toThrow()
  })

  it('accepts the fake given with a relative path', () => {
    expect(() => assertFakeClaude(join('tools', 'fake-claude', '..', 'fake-claude', 'fake-claude.mjs'))).not.toThrow()
  })

  it.each([undefined, '', 'claude', String.raw`C:\Users\someone\.local\bin\claude.exe`, join(FAKE_BIN, '..', 'other.mjs')])(
    'refuses %s',
    (bin) => {
      expect(() => assertFakeClaude(bin)).toThrow(/e2e refuses to run/)
    }
  )
})

describe('assertFakeModel3d', () => {
  const root = String.raw`C:\Temp\cc-e2e-1`
  const fake = { CC_MODEL3D_PORT: '50123', CC_MODEL3D_ENGINE_DIR: join(root, 'engine'), CC_MODEL3D_COORD: join(root, 'coord', 'coord.py') }

  it('accepts fakes inside the test root on another port', () => {
    expect(() => assertFakeModel3d(fake, root)).not.toThrow()
  })

  it.each([
    ['the real port', { CC_MODEL3D_PORT: '8189' }],
    ['no port', { CC_MODEL3D_PORT: undefined }],
    ['the real engine', { CC_MODEL3D_ENGINE_DIR: String.raw`C:\ComfyUI3D` }],
    ['the real coord board', { CC_MODEL3D_COORD: String.raw`C:\dfst_coord\coord.py` }],
    ['no coord board', { CC_MODEL3D_COORD: undefined }]
  ])('refuses %s', (_name, over) => {
    expect(() => assertFakeModel3d({ ...fake, ...over }, root)).toThrow(/e2e refuses to run/)
  })
})
