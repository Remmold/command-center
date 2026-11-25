import { describe, expect, it } from 'vitest'
import { isLocalUrl, localServers } from './localPorts'

describe('localServers', () => {
  it('finds a dev server URL with its port', () => {
    expect(localServers('> vite\n\n  Local:   http://localhost:5173/\n')).toEqual([{ port: 5173, url: 'http://localhost:5173' }])
  })

  it('keeps 127.0.0.1 and the https scheme', () => {
    expect(localServers('serving on https://127.0.0.1:8443/app')).toEqual([{ port: 8443, url: 'https://127.0.0.1:8443' }])
  })

  it('opens 0.0.0.0 and [::1] as localhost', () => {
    expect(localServers('bound http://0.0.0.0:3000 and http://[::1]:4000')).toEqual([
      { port: 3000, url: 'http://localhost:3000' },
      { port: 4000, url: 'http://localhost:4000' }
    ])
  })

  it('ignores non-local hosts and URLs without a port', () => {
    expect(localServers('docs at https://vitejs.dev:443/guide, http://192.168.1.4:3000, http://localhost/ and http://localhost.example.com:80')).toEqual([])
  })

  it('merges the same port found twice, first spelling wins', () => {
    expect(localServers('http://localhost:3000\nready on http://127.0.0.1:3000\nhttp://localhost:3000/')).toEqual([{ port: 3000, url: 'http://localhost:3000' }])
  })

  it('reads a port that the terminal colours', () => {
    expect(localServers('Local: \u001b[36mhttp://localhost:\u001b[1m5173\u001b[22m/\u001b[39m')).toEqual([{ port: 5173, url: 'http://localhost:5173' }])
  })

  it('ignores a port out of range', () => {
    expect(localServers('http://localhost:0 http://localhost:70000')).toEqual([])
  })
})

describe('isLocalUrl', () => {
  it('accepts a local address with a port', () => {
    expect(isLocalUrl('http://localhost:5173')).toBe(true)
    expect(isLocalUrl('https://127.0.0.1:8443/')).toBe(true)
  })

  it('refuses anything else', () => {
    for (const url of ['https://example.com', 'http://localhost.example.com:80', 'file:///C:/Windows', 'http://192.168.1.4:3000', 'javascript:alert(1)', 'http://user@evil.com:80', 'not a url']) {
      expect(isLocalUrl(url), url).toBe(false)
    }
  })
})
