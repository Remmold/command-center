import { describe, expect, it } from 'vitest'
import { isEmptyPreviewConfig, readPreviewConfig, serverCommand } from './previewConfig'

const full = {
  install: 'pnpm install',
  servers: [
    { name: 'web', command: 'pnpm dev --port {port}', cwd: 'apps/web' },
    { name: 'api', command: 'node server.js', cwd: '.' }
  ],
  startPage: '/login'
}

describe('readPreviewConfig', () => {
  it('reads a config with an install command and several servers', () => {
    expect(readPreviewConfig(full)).toEqual({
      ok: true,
      config: {
        install: 'pnpm install',
        servers: [
          { name: 'web', command: 'pnpm dev --port {port}', cwd: 'apps/web', ready: 'port' },
          { name: 'api', command: 'node server.js', cwd: '.', ready: 'port' }
        ],
        startPage: '/login'
      }
    })
  })

  it('defaults the folder to the worktree root and the start page to /', () => {
    expect(readPreviewConfig({ servers: [{ name: 'web', command: 'run' }] })).toEqual({
      ok: true,
      config: { install: '', servers: [{ name: 'web', command: 'run', cwd: '.', ready: 'port' }], startPage: '/' }
    })
  })

  it('trims the text fields', () => {
    const r = readPreviewConfig({ install: '  pnpm i ', servers: [{ name: ' web ', command: ' run ', cwd: ' . ' }], startPage: ' /a ' })
    expect(r.ok && r.config.install).toBe('pnpm i')
    expect(r.ok && r.config.servers[0].name).toBe('web')
    expect(r.ok && r.config.startPage).toBe('/a')
  })

  it.each([
    ['not an object', 'x', 'preview config'],
    ['install not text', { install: 3 }, 'install'],
    ['servers not a list', { servers: {} }, 'servers'],
    ['a server missing its name', { servers: [{ command: 'run' }] }, 'servers[1].name'],
    ['a server missing its command', { servers: [{ name: 'web' }] }, 'servers[1].command'],
    ['the second server missing its command', { servers: [{ name: 'a', command: 'x' }, { name: 'b', command: ' ' }] }, 'servers[2].command'],
    ['a folder outside the worktree', { servers: [{ name: 'a', command: 'x', cwd: '../up' }] }, 'servers[1].cwd'],
    ['an absolute folder', { servers: [{ name: 'a', command: 'x', cwd: 'C:\\x' }] }, 'servers[1].cwd'],
    ['a duplicate server name', { servers: [{ name: 'a', command: 'x' }, { name: 'a', command: 'y' }] }, 'servers[2].name'],
    ['a ready check other than port', { servers: [{ name: 'a', command: 'x', ready: 'http' }] }, 'servers[1].ready'],
    ['a start page without a slash', { servers: [{ name: 'a', command: 'x' }], startPage: 'login' }, 'startPage'],
    ['a start page that is a full address', { servers: [{ name: 'a', command: 'x' }], startPage: 'http://evil.com/' }, 'startPage']
  ])('refuses %s, naming the field', (_n, raw, field) => {
    const r = readPreviewConfig(raw)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain(field)
  })
})

describe('serverCommand', () => {
  it('puts the port wherever the command says {port}', () => {
    expect(serverCommand('vite --port {port} --api {port}', 4101)).toBe('vite --port 4101 --api 4101')
  })
  it('leaves a command without a placeholder as it is', () => {
    expect(serverCommand('node server.js', 4101)).toBe('node server.js')
  })
})

describe('isEmptyPreviewConfig', () => {
  it('is empty with no install command and no servers', () => {
    expect(isEmptyPreviewConfig({ install: '', servers: [], startPage: '/' })).toBe(true)
    expect(isEmptyPreviewConfig({ install: 'x', servers: [], startPage: '/' })).toBe(false)
  })
})
