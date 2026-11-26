import { X } from 'lucide-react'
import { STATUS_LINE_HELP, STATUS_LINE_OPTIONS, isEditableStatusLine, type StatusLineKey, type StatusLineOption } from '../../../shared/statusLine'
import { Checkbox } from '../ui/Checkbox'
import { FormRow } from '../ui/FormRow'
import { IconButton } from '../ui/IconButton'
import { NoticeLine } from '../ui/NoticeLine'
import { TextField } from '../ui/TextField'

interface Props {
  settingKey: StatusLineKey
  /** The edited layer's value, with its waiting change. */
  value: unknown
  disabled: boolean
  onStage: (key: string, value: unknown) => void
}

function parseOption(option: StatusLineOption, text: string): number | undefined {
  const n = Number(text)
  if (!Number.isFinite(n) || n < (option.min ?? -Infinity)) return undefined
  return option.integer ? Math.round(n) : n
}

/** A status line's command and options, with a plain explanation; it can be set and changed here, and removed by the row's Reset. */
export function StatusLineEditor({ settingKey, value, disabled, onStage }: Props) {
  const help = <NoticeLine>{STATUS_LINE_HELP[settingKey]}</NoticeLine>
  if (value === undefined) {
    return (
      <div>
        {help}
        <FormRow
          label="Set a command"
          description="The command, then Enter."
          control={<TextField label={`Command for a new ${settingKey}`} placeholder="node ~/.claude/statusline.js" disabled={disabled} onSubmit={(command) => onStage(settingKey, { type: 'command', command })} />}
        />
      </div>
    )
  }
  if (!isEditableStatusLine(settingKey, value)) return <NoticeLine>This status line holds entries this editor doesn’t know, so it shows under Other keys as raw JSON.</NoticeLine>
  const set = (key: string, next: unknown) => {
    const { [key]: _old, ...rest } = value
    onStage(settingKey, next === undefined ? rest : { ...rest, [key]: next })
  }
  return (
    <div>
      {help}
      <FormRow
        label="Command"
        hint="command"
        description="Reset above takes the status line out of this layer."
        control={<TextField key={value.command} label={`Command of ${settingKey}`} initialValue={value.command} disabled={disabled} submitOnBlur keepOnSubmit onSubmit={(command) => set('command', command)} />}
      />
      {STATUS_LINE_OPTIONS[settingKey].map((option) => {
        const current = value[option.key]
        return (
          <FormRow
            key={option.key}
            label={option.label}
            hint={option.key}
            description={option.description}
            control={
              option.kind === 'toggle' ? (
                <Checkbox checked={current === true} disabled={disabled} onChange={(on) => set(option.key, on ? true : undefined)}>
                  On
                </Checkbox>
              ) : (
                <>
                  <TextField
                    key={String(current)}
                    label={option.label}
                    initialValue={current === undefined ? '' : String(current)}
                    placeholder="Not set"
                    disabled={disabled}
                    submitOnBlur
                    keepOnSubmit
                    onSubmit={(text) => {
                      const n = parseOption(option, text)
                      if (n !== undefined) set(option.key, n)
                    }}
                  />
                  {current !== undefined && !disabled && (
                    <IconButton label={`Clear ${option.label}`} tooltip="Take it out of the status line" onClick={() => set(option.key, undefined)}>
                      <X size={12} />
                    </IconButton>
                  )}
                </>
              )
            }
          />
        )
      })}
    </div>
  )
}
