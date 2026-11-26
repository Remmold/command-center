import { describe, expect, it } from 'vitest'
import { createRateGate, previewNavigation, previewPartition, previewRequestAllowed, previewStartUrl } from './previewNavigation'

const PORTS = [4100, 4101]

describe('preview navigation rule', () => {
  it('loads localhost and 127.0.0.1 on the feature\'s own ports', () => {
    expect(previewNavigation('http://localhost:4100/login', PORTS)).toBe('allow')
    expect(previewNavigation('http://127.0.0.1:4101/', PORTS)).toBe('allow')
    expect(previewNavigation('https://localhost:4100/', PORTS)).toBe('allow')
  })

  it('sends localhost on another port to the default browser, so it never loads another feature\'s server', () => {
    expect(previewNavigation('http://localhost:4102/', PORTS)).toBe('external')
    expect(previewNavigation('http://localhost/', PORTS)).toBe('external')
  })

  it('sends any other host to the default browser, including look-alikes', () => {
    expect(previewNavigation('https://example.com/', PORTS)).toBe('external')
    expect(previewNavigation('http://localhost.evil.com:4100/', PORTS)).toBe('external')
    expect(previewNavigation('http://localhost:4100@evil.com/', PORTS)).toBe('external')
    expect(previewNavigation('http://192.168.0.5:4100/', PORTS)).toBe('external')
  })

  it('refuses every scheme that is not http or https, and addresses that do not parse', () => {
    for (const url of ['file:///C:/secret.txt', 'javascript:alert(1)', 'ftp://localhost:4100/', 'cc-test-flow://x/y.html', 'not a url', '']) {
      expect(previewNavigation(url, PORTS)).toBe('deny')
    }
  })

  it('allows a default-port address only when the feature holds that port', () => {
    expect(previewNavigation('http://localhost/', [80])).toBe('allow')
  })
})

describe('preview requests', () => {
  it('lets the page load its own local servers and inline data, and nothing from the network', () => {
    expect(previewRequestAllowed('http://localhost:4101/api/me', PORTS)).toBe(true)
    expect(previewRequestAllowed('ws://localhost:4100/hmr', PORTS)).toBe(true)
    expect(previewRequestAllowed('data:image/png;base64,AAAA', PORTS)).toBe(true)
    expect(previewRequestAllowed('https://fonts.googleapis.com/css', PORTS)).toBe(false)
    expect(previewRequestAllowed('http://localhost:5000/', PORTS)).toBe(false)
    expect(previewRequestAllowed('wss://example.com/socket', PORTS)).toBe(false)
  })
})

describe('preview browser addresses', () => {
  it('opens on the start page of the first server\'s port', () => {
    expect(previewStartUrl(4100, '/login')).toBe('http://localhost:4100/login')
    expect(previewStartUrl(4100, '/')).toBe('http://localhost:4100/')
  })

  it('keeps one storage partition per feature name', () => {
    expect(previewPartition('login')).toBe('persist:feature-login')
    expect(previewPartition('login')).not.toBe(previewPartition('login-2'))
  })
})

describe('createRateGate', () => {
  it('lets one call through per interval and refuses the rest until it has passed', () => {
    let now = 10_000
    const gate = createRateGate(1000, () => now)
    expect(gate()).toBe(true)
    expect(gate()).toBe(false)
    now += 999
    expect(gate()).toBe(false)
    now += 1
    expect(gate()).toBe(true)
  })
})
