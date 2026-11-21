import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hookSettings, permissionLaunch, removeLegacyHook } from './launch'

describe('permissionLaunch', () => {
  it('gates an ask session through the hook when the approval server is up', () => {
    expect(permissionLaunch('ask', 5000, 'p1')).toEqual({
      cliMode: 'bypassPermissions',
      useHook: true,
      env: { CC_PERMISSION_PORT: '5000', CC_PANE_ID: 'p1', CC_PERMISSION_MODE: 'ask' }
    })
  })

  it('falls back to the CLI prompts for an ask session when the approval server is down', () => {
    expect(permissionLaunch('ask', null, 'p1')).toEqual({ cliMode: 'default', useHook: false, env: {} })
  })

  it('keeps acceptEdits on the CLI and asks the app for everything else', () => {
    expect(permissionLaunch('acceptEdits', 5000, 'p1')).toMatchObject({ cliMode: 'acceptEdits', useHook: true })
    expect(permissionLaunch('acceptEdits', null, 'p1')).toEqual({ cliMode: 'acceptEdits', useHook: false, env: {} })
  })

  it('passes plan and bypass straight to the CLI without the hook', () => {
    expect(permissionLaunch('plan', 5000, 'p1')).toEqual({ cliMode: 'plan', useHook: false, env: {} })
    expect(permissionLaunch('bypassPermissions', 5000, 'p1')).toEqual({ cliMode: 'bypassPermissions', useHook: false, env: {} })
  })

  it('leaves the mode to the CLI when none is chosen', () => {
    expect(permissionLaunch(undefined, 5000, 'p1')).toEqual({ cliMode: undefined, useHook: false, env: {} })
  })
})

describe('hookSettings', () => {
  it('runs the hook for every tool', () => {
    expect(hookSettings('node "C:/x/permission-hook.cjs"')).toEqual({
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node "C:/x/permission-hook.cjs"' }] }] }
    })
  })
})

describe('removeLegacyHook', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const repoWith = (content: string): { repo: string; path: string } => {
    const repo = mkdtempSync(join(tmpdir(), 'cc-legacy-'))
    dirs.push(repo)
    mkdirSync(join(repo, '.claude'))
    const path = join(repo, '.claude', 'settings.local.json')
    writeFileSync(path, content)
    return { repo, path }
  }
  const legacy = { matcher: '*', hooks: [{ type: 'command', command: 'node "C:/Users/a/AppData/Roaming/command-center/permission-hook.cjs"' }] }
  const own = { matcher: 'Bash', hooks: [{ type: 'command', command: 'python lint.py' }] }

  it('removes only the command center hook and keeps everything else', async () => {
    const { repo, path } = repoWith(
      JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [legacy, own], Stop: [own] } })
    )
    expect(await removeLegacyHook(repo)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({
      permissions: { allow: ['Bash(ls)'] },
      hooks: { PreToolUse: [own], Stop: [own] }
    })
  })

  it('drops empty hook lists it leaves behind', async () => {
    const { repo, path } = repoWith(JSON.stringify({ permissions: { allow: [] }, hooks: { PreToolUse: [legacy] } }))
    await removeLegacyHook(repo)
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ permissions: { allow: [] } })
  })

  it('does not touch a file without the hook', async () => {
    const content = JSON.stringify({ hooks: { PreToolUse: [own] } })
    const { repo, path } = repoWith(content)
    expect(await removeLegacyHook(repo)).toBe(false)
    expect(readFileSync(path, 'utf-8')).toBe(content)
  })

  it('does not touch a file it cannot parse', async () => {
    const { repo, path } = repoWith('{ // comment\n "hooks": {} }')
    expect(await removeLegacyHook(repo)).toBe(false)
    expect(readFileSync(path, 'utf-8')).toBe('{ // comment\n "hooks": {} }')
  })

  it('is fine when there is no settings file', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'cc-legacy-'))
    dirs.push(repo)
    expect(await removeLegacyHook(repo)).toBe(false)
    expect(existsSync(join(repo, '.claude'))).toBe(false)
  })
})
