import { pathKeys } from '../../../shared/claudeSettings'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormRow } from '../ui/FormRow'
import { JsonField } from '../ui/JsonField'

export interface OtherKeyRow {
  path: string
  /** With its waiting change; undefined once its removal waits for Save. */
  value: unknown
  /** As the file had it when its change was made. */
  before: unknown
  changed: boolean
  /** Set when the file on disk changed this waiting key since it was edited; holds the file's value now. */
  fileValue?: { value: unknown }
}

interface Props {
  rows: readonly OtherKeyRow[]
  disabled: boolean
  /** Stages a value for a key path; undefined removes the key from the layer. */
  onStage: (key: string, value: unknown) => void
  /** Told whether a key's box holds text not yet taken as its value. */
  onUnparsed: (key: string, unparsed: boolean) => void
}

const shownValue = (value: unknown): string => (value === undefined ? 'not set' : JSON.stringify(value))

/** Each key the page has no control for, with its raw value as JSON to edit, or a Remove. */
export function OtherKeysList({ rows, disabled, onStage, onUnparsed }: Props) {
  return (
    <div>
      {rows.map(({ path, value, before, changed, fileValue }) => {
        const name = pathKeys(path).join('.')
        const removed = value === undefined
        return (
          <FormRow
            key={path}
            label={name}
            notes={
              <>
                {removed && <Badge tone="muted">Removed on Save</Badge>}
                {changed && !removed && <Badge tone="muted">Changed</Badge>}
                {fileValue && <Badge tone="quiet-warning">The file now has {shownValue(fileValue.value)}: Save asks which to keep</Badge>}
              </>
            }
            control={
              removed ? (
                <Button variant="link" disabled={disabled} tooltip="Keep it in the file" onClick={() => onStage(path, before)}>
                  Keep
                </Button>
              ) : (
                <Button variant="link" disabled={disabled} tooltip="Remove it from this layer’s file" onClick={() => onStage(path, undefined)}>
                  Remove
                </Button>
              )
            }
          >
            {!removed && (
              <JsonField label={`Value of ${name}`} value={value} disabled={disabled} onChange={(next) => onStage(path, next)} onUnparsedChange={(unparsed) => onUnparsed(path, unparsed)} />
            )}
          </FormRow>
        )
      })}
    </div>
  )
}
