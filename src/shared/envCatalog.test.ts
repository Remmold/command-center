import { describe, expect, it } from 'vitest'
import { DESCRIBED_ENV_VARS, ENV_VAR_NAMES, envLeftOut, envRows, envVar, ignoredHere, isSecretName, retiredNote, toggleText, toggledOn } from './envCatalog'

describe('the environment catalog', () => {
  it('lists every documented name once, and describes only listed names, once each', () => {
    expect(new Set(ENV_VAR_NAMES).size).toBe(ENV_VAR_NAMES.length)
    expect(ENV_VAR_NAMES.length).toBeGreaterThan(400)
    const described = DESCRIBED_ENV_VARS.map((v) => v.name)
    expect(new Set(described).size).toBe(described.length)
    for (const name of described) expect(ENV_VAR_NAMES, name).toContain(name)
    expect(described.length).toBeGreaterThanOrEqual(60)
    expect(described.length).toBeLessThanOrEqual(80)
    for (const v of DESCRIBED_ENV_VARS) expect(v.description, v.name).toMatch(/^[A-Z].*\.$/)
  })

  it('marks the names the docs say are removed or deprecated', () => {
    expect(retiredNote('CLAUDE_CODE_CONNECT_TIMEOUT_MS')).toMatch(/Removed/)
    expect(retiredNote('ANTHROPIC_SMALL_FAST_MODEL')).toMatch(/Deprecated/)
    expect(retiredNote('API_TIMEOUT_MS')).toBeNull()
  })
})

describe('masking', () => {
  it('applies to a name holding KEY, TOKEN, SECRET or PASSWORD, in any case', () => {
    for (const name of ['ANTHROPIC_API_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'MCP_CLIENT_SECRET', 'DB_PASSWORD', 'my_token']) expect(isSecretName(name), name).toBe(true)
    for (const name of ['API_TIMEOUT_MS', 'HTTPS_PROXY', 'DISABLE_TELEMETRY']) expect(isSecretName(name), name).toBe(false)
  })
})

describe('typed values', () => {
  it('save on and off as the strings the variable takes; off removes a variable read as set-or-not', () => {
    const autoupdater = envVar('DISABLE_AUTOUPDATER')
    expect(autoupdater?.kind).toBe('toggle')
    expect(toggleText(autoupdater!, true)).toBe('1')
    expect(toggleText(autoupdater!, false)).toBe('0')
    expect(toggleText(envVar('DISABLE_TELEMETRY')!, false)).toBeUndefined()
    expect(toggleText(envVar('CLAUDE_CODE_SYNTAX_HIGHLIGHT')!, false)).toBe('false')
    expect(envVar('API_TIMEOUT_MS')?.kind).toBe('number')
  })

  it('read any of the docs’ on words as on; a set-or-not variable is on with any value', () => {
    const autoupdater = envVar('DISABLE_AUTOUPDATER')!
    for (const text of ['1', 'true', 'YES', 'on']) expect(toggledOn(autoupdater, text), text).toBe(true)
    for (const text of ['0', 'false', 'off']) expect(toggledOn(autoupdater, text), text).toBe(false)
    expect(toggledOn(autoupdater, 'maybe')).toBeUndefined()
    expect(toggledOn(envVar('DISABLE_TELEMETRY')!, '0')).toBe(true)
  })
})

describe('environment values the editor can’t show', () => {
  it('are a variable that isn’t text, or an env that isn’t an object', () => {
    expect(envLeftOut({ A: '1', B: 2, C: { x: 1 } })).toEqual([['B'], ['C']])
    expect(envLeftOut(['A'])).toEqual([[]])
    expect(envLeftOut({})).toEqual([])
  })
})

describe('variables per layer', () => {
  const layers = {
    organisation: null,
    local: { env: { API_TIMEOUT_MS: '900000', CLAUDE_CONFIG_DIR: 'D:/claude' } },
    repo: { env: { HTTPS_PROXY: 'http://proxy:8080' } },
    account: { env: { API_TIMEOUT_MS: '600000', ANTHROPIC_API_KEY: 'sk-1', CLAUDE_CONFIG_DIR: 'C:/claude' } }
  }

  it('give the edited layer’s own and the others’ variables, each with the value that applies and where from', () => {
    const rows = envRows('account', layers)
    expect(rows.map((r) => [r.name, r.value ?? null, r.effective?.value ?? null, r.effective?.layer ?? null])).toEqual([
      ['API_TIMEOUT_MS', '600000', '900000', 'local'],
      ['ANTHROPIC_API_KEY', 'sk-1', 'sk-1', 'account'],
      ['CLAUDE_CONFIG_DIR', 'C:/claude', 'C:/claude', 'account'],
      ['HTTPS_PROXY', null, 'http://proxy:8080', 'repo']
    ])
    expect(rows.find((r) => r.name === 'API_TIMEOUT_MS')?.others).toEqual([{ layer: 'local', value: '900000' }])
  })

  it('skip a value Claude ignores from Repo and Local, and say so in those layers', () => {
    expect(ignoredHere('CLAUDE_CONFIG_DIR', 'local')).toMatch(/Account/)
    expect(ignoredHere('CLAUDE_CONFIG_DIR', 'account')).toBeNull()
    expect(ignoredHere('OTEL_EXPORTER_OTLP_ENDPOINT', 'repo')).not.toBeNull()
    expect(ignoredHere('CLAUDE_AX_SCREEN_READER', 'repo')).not.toBeNull()
    expect(ignoredHere('CLAUDE_CODE_REMOTE', 'account')).toMatch(/never from a settings file/)
    expect(envRows('local', layers).find((r) => r.name === 'CLAUDE_CONFIG_DIR')?.effective).toEqual({ value: 'C:/claude', layer: 'account' })
  })

  it('are none for a layer without env', () => {
    expect(envRows('account', { organisation: null, local: null, repo: null, account: {} })).toEqual([])
  })
})
