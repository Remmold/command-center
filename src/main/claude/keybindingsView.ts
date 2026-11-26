import { isSettingsObject, type SettingsObject } from '../../shared/claudeSettings'
import { KEYBINDINGS_DOCS_URL, KEYBINDINGS_SCHEMA_URL } from '../../shared/keybindings'

interface Block extends SettingsObject {
  context: string
  bindings: SettingsObject
}

const isBlock = (value: unknown): value is Block => isSettingsObject(value) && typeof value.context === 'string' && isSettingsObject(value.bindings)

/** What a new keybindings.json starts with, as `/keybindings` writes it. */
export const NEW_KEYBINDINGS: SettingsObject = {
  $schema: KEYBINDINGS_SCHEMA_URL,
  $docs: KEYBINDINGS_DOCS_URL
}

/**
 * The file with its `bindings` list as one object of keys per context, so a key is a path a patch can name
 * (`bindings.Chat.ctrl+e`). A context in several blocks merges, the later block winning, as Claude reads it.
 */
export function keybindingsView(file: SettingsObject): { ok: true; value: SettingsObject } | { ok: false; error: string } {
  if (!('bindings' in file)) return { ok: true, value: file }
  if (!Array.isArray(file.bindings) || !file.bindings.every(isBlock))
    return {
      ok: false,
      error: 'not key bindings: each entry of "bindings" needs a context name and an object of keys'
    }
  const merged: Record<string, SettingsObject> = {}
  for (const block of file.bindings) merged[block.context] = { ...merged[block.context], ...block.bindings }
  return {
    ok: true,
    value: Object.fromEntries(Object.entries(file).map(([key, value]) => [key, key === 'bindings' ? merged : value]))
  }
}

/**
 * The file as the view now reads: each key changes in every block that holds it and goes from them once
 * gone, a new key joins the last block of its context and a new context goes at the end. A block the
 * change emptied goes; one that was empty already stays.
 */
export function keybindingsFile(file: SettingsObject, view: SettingsObject): SettingsObject {
  const wanted = isSettingsObject(view.bindings) ? view.bindings : {}
  const blocks = Array.isArray(file.bindings) ? file.bindings.filter(isBlock) : []
  const written = new Set<string>()
  const id = (context: string, key: string) => JSON.stringify([context, key])
  const out = blocks.map((block) => {
    const inView = wanted[block.context]
    const want: SettingsObject = isSettingsObject(inView) ? inView : {}
    const kept = Object.keys(block.bindings).filter((key) => Object.hasOwn(want, key))
    for (const key of kept) written.add(id(block.context, key))
    return { block: { ...block, bindings: Object.fromEntries(kept.map((key) => [key, want[key]])) }, had: Object.keys(block.bindings).length > 0 }
  })
  for (const [context, want] of Object.entries(wanted)) {
    if (!isSettingsObject(want)) continue
    const fresh = Object.entries(want).filter(([key]) => !written.has(id(context, key)))
    if (fresh.length === 0) continue
    const last = out.filter((entry) => entry.block.context === context).pop()
    if (last) Object.assign(last.block.bindings, Object.fromEntries(fresh))
    else out.push({ block: { context, bindings: Object.fromEntries(fresh) }, had: true })
  }
  const list = out.filter((entry) => !entry.had || Object.keys(entry.block.bindings).length > 0).map((entry) => entry.block)
  const result = Object.fromEntries(Object.entries(view).map(([key, value]) => [key, key === 'bindings' ? list : value]))
  return 'bindings' in result || !('bindings' in file) ? result : { ...result, bindings: list }
}
