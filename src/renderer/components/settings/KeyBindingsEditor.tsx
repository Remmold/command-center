import { useMemo, useState } from 'react'
import { getAt, isSettingsObject, keyPath, type SettingsObject } from '../../../shared/claudeSettings'
import {
  KEYBINDING_ACTIONS,
  KEYBINDING_CONTEXTS,
  actionChanged,
  actionKeys,
  actionWords,
  addKeyEdits,
  bindingLabel,
  boundAction,
  keybindingAction,
  otherBindings,
  reservedReason,
  resetEdits,
  normalBinding,
  unbindEdits,
  type ContextKeys,
  type KeyEdit,
  type KeybindingAction,
  type OtherBinding
} from '../../../shared/keybindings'
import { Badge } from '../ui/Badge'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { FormRow } from '../ui/FormRow'
import { KeyCaptureField } from '../ui/KeyCaptureField'
import { KeyChip } from '../ui/KeyChip'
import { NoticeLine } from '../ui/NoticeLine'
import { PageGroup } from '../ui/Page'
import { SearchField } from '../ui/SearchField'

interface Props {
  /** keybindings.json as the page reads it, each context's keys under `bindings`, with the waiting changes. */
  value: SettingsObject | null
  /** The file as on disk, so an entry Save takes out can be kept. */
  saved: SettingsObject | null
  disabled: boolean
  onStage: (key: string, value: unknown) => void
}

const contextKeys = (value: SettingsObject | null, context: string): ContextKeys | undefined => {
  const keys = getAt(value, keyPath('bindings', context))
  return isSettingsObject(keys) ? keys : undefined
}

function ActionRow({ entry, keys, disabled, onEdits }: { entry: KeybindingAction; keys: ContextKeys | undefined; disabled: boolean; onEdits: (edits: KeyEdit[]) => void }) {
  const [capturing, setCapturing] = useState(false)
  const shown = actionKeys(entry, keys)
  const changed = actionChanged(entry, keys)
  const taken = (binding: string): string | null => {
    const now = boundAction(entry.context, keys, binding)
    if (now === entry.action) return 'It already runs this.'
    return now ? `It runs ${actionWords(entry.context, now)} now; it moves here.` : null
  }
  return (
    <FormRow
      label={entry.label}
      hint={entry.action}
      notes={
        <>
          {shown.length === 0 && <span>No key</span>}
          {shown.map(({ binding }) => (
            <KeyChip
              key={binding}
              label={bindingLabel(binding)}
              removeLabel={`Unbind ${bindingLabel(binding)} from ${entry.label}`}
              onRemove={disabled || reservedReason(binding) ? undefined : () => onEdits(unbindEdits(entry, keys, binding))}
            />
          ))}
          {changed && <Badge tone="quiet">Built in: {entry.defaults.length > 0 ? entry.defaults.map(bindingLabel).join(', ') : 'no key'}</Badge>}
        </>
      }
      control={
        capturing ? (
          <KeyCaptureField
            label={`Keys for ${entry.label}`}
            problem={reservedReason}
            note={taken}
            onCapture={(binding) => {
              onEdits(addKeyEdits(entry, keys, binding))
              setCapturing(false)
            }}
            onCancel={() => setCapturing(false)}
          />
        ) : (
          <>
            {changed && (
              <Button variant="link" disabled={disabled} tooltip="Back to the built-in keys" onClick={() => onEdits(resetEdits(entry, keys))}>
                Reset
              </Button>
            )}
            <Button variant="secondary" disabled={disabled} label={`Add a key to ${entry.label}`} onClick={() => setCapturing(true)}>
              Add key
            </Button>
          </>
        )
      }
    />
  )
}

const otherId = ({ context, key }: OtherBinding): string => JSON.stringify([context, key])

/** The file's entries no action row shows, kept visible with their raw value; one Save takes out can be kept. */
function OtherBindingsList({ rows, disabled, onStage }: { rows: { binding: OtherBinding; removed: boolean }[]; disabled: boolean; onStage: (key: string, value: unknown) => void }) {
  return (
    <PageGroup title="Other bindings">
      <NoticeLine>Entries this page has no action for: a command, a context or action it doesn’t know, or a key without a built-in action.</NoticeLine>
      <div>
        {rows.map(({ binding, removed }) => {
          const { context, key, value } = binding
          const path = key === '' ? keyPath('bindings', context) : keyPath('bindings', context, key)
          const known = KEYBINDING_CONTEXTS.some((c) => c.name === context)
          return (
            <FormRow
              key={otherId(binding)}
              label={key === '' ? context : `${context} · ${bindingLabel(key)}`}
              hint={JSON.stringify(value)}
              description={key === '' ? 'Not an object of keys.' : value === null ? 'Unbinds the key, which runs nothing here by default.' : `Runs ${actionWords(context, value)}.`}
              notes={
                <>
                  {!known && <Badge tone="quiet-warning">Claude Code doesn’t list this context</Badge>}
                  {removed && <Badge tone="muted">Removed on Save</Badge>}
                </>
              }
              control={
                removed ? (
                  <Button variant="link" disabled={disabled} tooltip="Keep it in the file" onClick={() => onStage(path, value)}>
                    Keep
                  </Button>
                ) : (
                  <Button variant="link" disabled={disabled} tooltip="Remove it from the file" onClick={() => onStage(path, undefined)}>
                    Remove
                  </Button>
                )
              }
            />
          )
        })}
      </div>
    </PageGroup>
  )
}

/** By the action's words or name, its context, or a key that runs it, written either way (`ctrl+k` or `Ctrl+K`). */
function matches(entry: KeybindingAction, contextLabel: string, keys: ContextKeys | undefined, query: string): boolean {
  const words = query.trim().toLowerCase()
  if (!words) return true
  const asKey = normalBinding(words)
  return (
    [entry.label, entry.action, entry.context, contextLabel].some((text) => text.toLowerCase().includes(words)) ||
    actionKeys(entry, keys).some(({ binding }) => binding.includes(asKey) || bindingLabel(binding).toLowerCase().includes(words))
  )
}

/** Every action terminal Claude has, per context, with the keys that run it now; keys are set by pressing them. */
export function KeyBindingsEditor({ value, saved, disabled, onStage }: Props) {
  const [query, setQuery] = useState('')
  const onEdits = (edits: KeyEdit[]) => edits.forEach(({ path, value: next }) => onStage(path, next))
  const bindings = getAt(value, 'bindings')
  const others = useMemo(() => {
    const now = otherBindings(isSettingsObject(bindings) ? bindings : undefined)
    const before = otherBindings(isSettingsObject(getAt(saved, 'bindings')) ? (getAt(saved, 'bindings') as Record<string, unknown>) : undefined)
    const ids = new Set(now.map(otherId))
    return [...now.map((binding) => ({ binding, removed: false })), ...before.filter((b) => !ids.has(otherId(b))).map((binding) => ({ binding, removed: true }))]
  }, [bindings, saved])
  const groups = KEYBINDING_CONTEXTS.map((context) => {
    const keys = contextKeys(value, context.name)
    return {
      context,
      keys,
      entries: KEYBINDING_ACTIONS.filter((a) => a.context === context.name && matches(a, context.label, keys, query))
    }
  }).filter((group) => group.entries.length > 0)
  return (
    <>
      <Banner label="Key bindings change terminal Claude">These keys change Claude Code in a terminal, not this app’s shortcuts. Terminal Claude picks a change up without a restart.</Banner>
      <div className="w-72 max-w-full">
        <SearchField label="Find key bindings" placeholder="Find an action or key" value={query} onChange={setQuery} />
      </div>
      {groups.length === 0 && <NoticeLine>No action matches “{query.trim()}”.</NoticeLine>}
      {groups.map(({ context, keys, entries }) => (
        <PageGroup key={context.name} title={`${context.label} · ${context.name}`}>
          <div>
            {entries.map((entry) => (
              <ActionRow key={entry.action} entry={entry} keys={keys} disabled={disabled} onEdits={onEdits} />
            ))}
          </div>
        </PageGroup>
      ))}
      {others.length > 0 && <OtherBindingsList rows={others} disabled={disabled} onStage={onStage} />}
    </>
  )
}
