import { SOURCE_ORDER, getAt, isSettingsObject, sameValue, type SettingsLayer, type SettingsObject, type SourceLayer } from './claudeSettings'
import { LAYER_NAMES, countsIn, layerList, type SettingEntry } from './claudeSettingsCatalog'

/** Each layer's settings for one workspace; null where the layer has no file. */
export type LayerSettings = Record<SourceLayer, SettingsObject | null>

export interface EffectiveSetting {
  value: unknown
  /** The layers the value comes from, highest first; empty when no layer sets it. */
  sources: SourceLayer[]
  /** The organisation sets it, so no layer below can change it. */
  locked: boolean
}

const COMBINED_LISTS = new Set(['permissions.allow', 'permissions.ask', 'permissions.deny', 'permissions.additionalDirectories'])

const union = (lists: unknown[][]): unknown[] => lists.flat().filter((item, i, all) => all.findIndex((other) => sameValue(other, item)) === i)

/** Per key, the highest layer's value wins; the hook lists of one event add up, without repeats. */
function combineObjects(key: string, objects: SettingsObject[]): SettingsObject {
  const combined: SettingsObject = {}
  for (const object of objects) {
    for (const [name, value] of Object.entries(object)) {
      if (!(name in combined)) combined[name] = value
      else if (key === 'hooks' && Array.isArray(combined[name]) && Array.isArray(value)) combined[name] = union([combined[name] as unknown[], value])
    }
  }
  return combined
}

export function effectiveSetting(entry: SettingEntry, layers: LayerSettings): EffectiveSetting {
  const set = SOURCE_ORDER.flatMap((layer) => {
    const value = getAt(layers[layer], entry.key)
    return value !== undefined && countsIn(entry, layer, value) ? [{ layer, value }] : []
  })
  if (set.length === 0) return { value: undefined, sources: [], locked: false }

  const stricter = entry.stricter && set.find(({ layer, value }) => entry.stricter?.from.includes(layer) && sameValue(value, entry.stricter.value))
  const top = stricter || set[0]
  const single: EffectiveSetting = { value: top.value, sources: [top.layer], locked: top.layer === 'organisation' }
  if (stricter || entry.whole) return single

  if (COMBINED_LISTS.has(entry.key) && set.every(({ value }) => Array.isArray(value))) {
    return { value: union(set.map(({ value }) => value as unknown[])), sources: set.map(({ layer }) => layer), locked: false }
  }
  if (set.every(({ value }) => isSettingsObject(value))) {
    return { value: combineObjects(entry.key, set.map(({ value }) => value as SettingsObject)), sources: set.map(({ layer }) => layer), locked: false }
  }
  return single
}

const above = (a: SourceLayer, b: SourceLayer): boolean => SOURCE_ORDER.indexOf(a) < SOURCE_ORDER.indexOf(b)

/** Where the effective value comes from, as seen from the layer being edited; null when no layer sets it. */
export function sourceBadge({ sources, locked }: EffectiveSetting, entry: SettingEntry, layers: LayerSettings, edited: SettingsLayer): string | null {
  if (sources.length === 0) return null
  if (locked) return 'Set by your organisation'
  if (sources.length > 1) return `Combined from ${layerList(sources)}`
  const [source] = sources
  const editedValue = getAt(layers[edited], entry.key)
  const editedCounts = editedValue !== undefined && countsIn(entry, edited, editedValue)
  return source !== edited && (above(source, edited) || editedCounts) ? `Overridden by ${LAYER_NAMES[source]}` : `From ${LAYER_NAMES[source]}`
}
