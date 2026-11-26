import { describe, expect, it } from 'vitest'
import schema from './fixtures/claude-code-settings.schema.json'
import { SETTINGS_CATALOG, SETTING_CATEGORIES, changeText, defaultText, entryFor, formatSettingValue, otherKeys, shownSettings, type SettingsFilter } from './claudeSettingsCatalog'

/** Schema keys the catalog leaves out on purpose, and why. */
const SKIPPED: Record<string, string> = {
  $schema: 'points editors at the schema; not a setting',
  sandbox: 'sandbox settings are macOS, Linux and WSL only',
  'permissions.disableAutoMode': 'another spelling of disableAutoMode, which the catalog has',
  allowedChannelPlugins: 'managed only',
  allowManagedHooksOnly: 'managed only',
  allowManagedPermissionRulesOnly: 'managed only',
  strictKnownMarketplaces: 'managed only',
  parentSettingsBehavior: 'managed only',
  pluginTrustMessage: 'managed only',
  allowManagedMcpServersOnly: 'managed only',
  blockedMarketplaces: 'managed only',
  channelsEnabled: 'managed only',
  forceRemoteSettingsRefresh: 'managed only',
  strictPluginOnlyCustomization: 'managed only',
  wslInheritsWindowsSettings: 'managed only',
  managedMcpServers: 'managed only',
  pluginSuggestionMarketplaces: 'managed only',
  requiredMaximumVersion: 'managed only',
  requiredMinimumVersion: 'managed only',
  sshHostAllowlist: 'managed only',
  allowAllClaudeAiMcps: 'managed only',
  claudeMd: 'managed only',
  policyHelper: 'managed only',
  disableSideloadFlags: 'managed only',
  browserExternalPageTools: 'managed only',
  disableBrowserExternalNavigation: 'managed only',
  disableMobileSimulatorTools: 'managed only',
  requireCoworkFullVmSandbox: 'managed only',
  teammateDefaultModel: 'lives in ~/.claude.json, not a settings file',
  permissionExplainerEnabled: 'lives in ~/.claude.json, not a settings file',
  diffTool: 'lives in ~/.claude.json, not a settings file',
  externalEditorContext: 'lives in ~/.claude.json, not a settings file',
  autoConnectIde: 'lives in ~/.claude.json, not a settings file',
  autoInstallIdeExtension: 'lives in ~/.claude.json, not a settings file'
}

interface SchemaObject {
  properties: Record<string, { properties?: Record<string, unknown> }>
}

const properties = (schema as unknown as SchemaObject).properties
const schemaKeys = [...Object.keys(properties), ...Object.keys(properties.permissions.properties ?? {}).map((key) => `permissions.${key}`)]
const catalogKeys = SETTINGS_CATALOG.map((e) => e.key)
const covered = (key: string): boolean => catalogKeys.includes(key) || catalogKeys.some((k) => k.startsWith(`${key}.`))

describe('the settings catalog', () => {
  it('has unique keys and labels, each in a listed category', () => {
    expect(new Set(catalogKeys).size).toBe(catalogKeys.length)
    const labels = SETTINGS_CATALOG.map((e) => e.label)
    expect(labels.filter((label, i) => labels.indexOf(label) !== i)).toEqual([])
    for (const entry of SETTINGS_CATALOG) expect(SETTING_CATEGORIES).toContain(entry.category)
  })

  it('gives every choice options and a default among them or a written default', () => {
    for (const entry of SETTINGS_CATALOG) {
      if (entry.control.kind !== 'choice') continue
      expect(entry.control.options.length, entry.key).toBeGreaterThan(0)
      if (entry.default === undefined) expect(entry.defaultLabel, entry.key).toBeTruthy()
      else expect(entry.control.options.map((o) => o.value), entry.key).toContain(entry.default)
    }
  })

  it('has every key of the published schema valid outside managed settings, or says why not', () => {
    expect(schemaKeys.filter((key) => !covered(key) && !(key in SKIPPED))).toEqual([])
    expect(Object.keys(SKIPPED).filter((key) => covered(key))).toEqual([])
  })

  it('offers the question timeouts the schema allows', () => {
    const timeout = SETTINGS_CATALOG.find((e) => e.key === 'askUserQuestionTimeout')
    expect(timeout?.control.kind === 'choice' && timeout.control.options.map((o) => o.value)).toEqual(['60s', '5m', '10m', 'never'])
  })

  it('says the default in words', () => {
    const toggle = { ...SETTINGS_CATALOG[0], control: { kind: 'toggle' as const }, default: true, defaultLabel: undefined }
    expect(defaultText(toggle)).toBe('Default: on')
  })

  it('shows each model’s saved effort as model and level', () => {
    expect(formatSettingValue(entryFor('modelSettings'), { 'claude-opus-5-5': { effortLevel: 'high' }, 'claude-haiku-5': { autoCompactWindow: 'auto' } })).toBe('claude-opus-5-5: High')
  })

  it('counts the rules of a permission list, and shows a change to one as the rules added and removed', () => {
    const allow = entryFor('permissions.allow')
    expect(formatSettingValue(allow, ['Read', 'Bash(git status *)'])).toBe('2 rules')
    expect(formatSettingValue(allow, ['Read'])).toBe('1 rule')
    expect(formatSettingValue(allow, [])).toBe('none')
    expect(changeText(allow, ['Read', 'Edit'], ['Edit', 'Bash(git status *)'])).toBe('Added Bash(git status *) · Removed Read')
    expect(changeText(allow, undefined, ['Read'])).toBe('Added Read')
    expect(changeText(entryFor('model'), 'sonnet', 'opus')).toBe('Sonnet → Opus')
  })

  it('warns for an Allow list with a rule that lets every shell command through, not for Ask or Deny', () => {
    expect(entryFor('permissions.allow').risk?.(['Read', 'PowerShell'])).toMatch(/PowerShell/)
    expect(entryFor('permissions.allow').risk?.(['Read', 'Bash(git status:*)'])).toBeNull()
    expect(entryFor('permissions.ask').risk?.(['Bash'])).toBeFalsy()
  })
})

describe('the settings shown', () => {
  const filter = (given: Partial<SettingsFilter>): SettingsFilter => ({ category: 'Model & thinking', query: '', showAdvanced: false, hideTerminalOnly: false, ...given })
  const keys = (given: Partial<SettingsFilter>) => shownSettings(filter(given)).flatMap((g) => g.entries.map((e) => e.key))

  it('are the common settings of the category, the advanced ones only when asked for, after the common ones', () => {
    expect(keys({})).toContain('model')
    expect(keys({})).not.toContain('maxEffortLevel')
    const all = keys({ showAdvanced: true })
    expect(all.indexOf('maxEffortLevel')).toBeGreaterThan(all.indexOf('outputStyle'))
    expect(keys({ category: 'Interface' })).not.toContain('model')
  })

  it('leave out terminal-only settings when filtered', () => {
    expect(keys({ category: 'Interface' })).toContain('theme')
    expect(keys({ category: 'Interface', hideTerminalOnly: true })).not.toContain('theme')
    expect(keys({ category: 'Interface', hideTerminalOnly: true })).toContain('promptSuggestionEnabled')
  })

  it('come from every category when searching, by label, description or raw key, advanced ones included', () => {
    expect(keys({ category: 'Interface', query: 'extended thinking' })).toEqual(['alwaysThinkingEnabled'])
    expect(keys({ query: 'disableAllHooks' })).toEqual(['disableAllHooks'])
    expect(keys({ query: 'secrets' })).toContain('permissions.deny')
    expect(keys({ query: 'effort cap' })).toEqual(['maxEffortLevel'])
    expect(shownSettings(filter({ query: 'worktree' })).map((g) => g.category)).toEqual(['Agents & worktrees'])
  })
})

describe('the other keys of a file', () => {
  it('are the keys no row shows, top level or inside an object the catalog splits into rows, in file order', () => {
    const file = {
      madeUpSetting: [1, 2],
      model: 'opus',
      attribution: { commit: 'x', madeUpPart: true },
      permissions: { allow: ['Read'], disableAutoMode: 'disable' },
      $schema: 'https://json.schemastore.org/claude-code-settings.json'
    }
    expect(otherKeys(file)).toEqual(['madeUpSetting', 'attribution.madeUpPart', 'permissions.disableAutoMode', '$schema'])
  })

  it('leave out everything inside a row that holds a whole object', () => {
    expect(otherKeys({ env: { MADE_UP: '1' }, enabledPlugins: { a: true } })).toEqual([])
  })

  it('include what the effort per model editor does not show: other keys of a model, a level that is not text, a model or value that is not an object', () => {
    const modelSettings = { 'claude-opus-5-5': { effortLevel: 'high', autoCompactWindow: 200000, maxEffortLevel: 'xhigh' }, 'claude-x.1': { effortLevel: 3 }, odd: 'nope' }
    expect(otherKeys({ modelSettings })).toEqual([
      'modelSettings.claude-opus-5-5.autoCompactWindow',
      'modelSettings.claude-opus-5-5.maxEffortLevel',
      'modelSettings.claude-x~11.effortLevel',
      'modelSettings.odd'
    ])
    expect(otherKeys({ modelSettings: 'nope' })).toEqual(['modelSettings'])
    expect(otherKeys({ modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' } } })).toEqual([])
  })

  it('include a permission list holding something other than text rules, which the rules editor can’t show', () => {
    expect(otherKeys({ permissions: { allow: ['Read', { tool: 'Bash' }], ask: ['Bash'], deny: 'Read' } })).toEqual(['permissions.allow', 'permissions.deny'])
  })

  it('include the hook events and status lines their editors can’t show', () => {
    const file = {
      hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [{ type: 'command', command: 'guard', timeout: 10 }] }], PreModelSwitch: [{ hooks: [] }] },
      statusLine: { type: 'command', command: 'node statusline.js', padding: 2 },
      subagentStatusLine: { type: 'command', command: 'x', padding: 2 }
    }
    expect(otherKeys(file)).toEqual(['hooks.PreModelSwitch', 'subagentStatusLine'])
  })

  it('take a split object whole when it is not an object, so its value is still shown', () => {
    expect(otherKeys({ worktree: 'nope', voice: { enabled: true } })).toEqual(['worktree'])
  })

  it('escape a dot in a key name, so the path leads back to the key', () => {
    expect(otherKeys({ 'made.up': 1, attribution: { 'a.b': 2 } })).toEqual(['made~1up', 'attribution.a~1b'])
  })

  it('are labelled and searched by their key names, not the escaped path', () => {
    expect(entryFor('attribution.a~1b').label).toBe('attribution.a.b')
  })

  it('are none for a file that does not parse', () => {
    expect(otherKeys(null)).toEqual([])
  })
})
