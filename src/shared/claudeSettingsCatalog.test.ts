import { describe, expect, it } from 'vitest'
import { SETTINGS_CATALOG, SETTING_CATEGORIES, defaultText } from './claudeSettingsCatalog'

describe('the settings catalog', () => {
  it('has unique keys, each in a listed category', () => {
    const keys = SETTINGS_CATALOG.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
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

  it('says the default in words', () => {
    const toggle = { ...SETTINGS_CATALOG[0], control: { kind: 'toggle' as const }, default: true, defaultLabel: undefined }
    expect(defaultText(toggle)).toBe('Default: on')
  })
})
