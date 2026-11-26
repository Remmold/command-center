import { useState } from 'react'
import { X } from 'lucide-react'
import type { SettingsLayer } from '../../../shared/claudeSettings'
import { layerList } from '../../../shared/claudeSettingsCatalog'
import type { RuleSource } from '../../../shared/claudeSettingsEffective'
import { RULE_LISTS, RULE_TOOLS, buildRule, describeRule, isRuleList, moveRule, ruleListKey, ruleRisk, type RuleList, type RuleTool } from '../../../shared/permissionRules'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { FormRow } from '../ui/FormRow'
import { IconButton } from '../ui/IconButton'
import { NoticeLine } from '../ui/NoticeLine'
import { Select } from '../ui/Select'
import { TextField } from '../ui/TextField'

interface Props {
  list: RuleList
  /** Each list's value in the edited layer, with its waiting changes. */
  lists: Record<RuleList, unknown>
  /** The rules this list combines to across the workspace's layers. */
  sources: readonly RuleSource[]
  layer: SettingsLayer
  disabled: boolean
  onStage: (key: string, value: unknown) => void
}

const LIST_NAMES: Record<RuleList, string> = { allow: 'Allow', ask: 'Ask', deny: 'Deny' }
const NO_MOVE = ''

const rulesIn = (value: unknown): readonly string[] | undefined => (isRuleList(value) ? value : undefined)

function RuleBuilder({ list, rules, disabled, onAdd }: { list: RuleList; rules: readonly string[]; disabled: boolean; onAdd: (rule: string) => void }) {
  const [tool, setTool] = useState<RuleTool>('Bash')
  const [name, setName] = useState('')
  const [pattern, setPattern] = useState('')
  // Bumped on each add, so the typed fields start empty again.
  const [added, setAdded] = useState(0)
  const choice = RULE_TOOLS.find((t) => t.value === tool) ?? RULE_TOOLS[0]
  const rule = buildRule({ tool, name, pattern })
  const missing = (tool === 'other' && name.trim() === '') || (tool === 'mcp' && pattern.trim() === '')
  const known = rules.includes(rule)
  const add = () => {
    if (missing || known) return
    onAdd(rule)
    setName('')
    setPattern('')
    setAdded(added + 1)
  }
  return (
    <FormRow
      label={`Add to ${LIST_NAMES[list]}`}
      hint={missing ? undefined : rule}
      description={missing ? 'Pick a tool and type what it may do.' : known ? 'This list has that rule already.' : describeRule(list, rule)}
      control={
        <>
          <Select label={`Tool for a new ${LIST_NAMES[list]} rule`} options={RULE_TOOLS} value={tool} disabled={disabled} onChange={(next) => setTool(next as RuleTool)} />
          <Button variant="secondary" disabled={disabled || missing || known} onClick={add}>
            Add
          </Button>
        </>
      }
    >
      {tool === 'other' && (
        <TextField key={`name-${added}`} label={`Tool name for a new ${LIST_NAMES[list]} rule`} placeholder="Tool name, such as Glob" disabled={disabled} onChange={setName} onSubmit={add} keepOnSubmit />
      )}
      {choice.placeholder !== null && (
        <TextField key={`pattern-${tool}-${added}`} label={`Pattern for a new ${LIST_NAMES[list]} rule`} placeholder={choice.placeholder} disabled={disabled} onChange={setPattern} onSubmit={add} keepOnSubmit />
      )}
    </FormRow>
  )
}

/** One permission list of the edited layer: its rules in plain words, each movable and removable, the rules other layers add, and a rule builder. */
export function PermissionRuleList({ list, lists, sources, layer, disabled, onStage }: Props) {
  const [othersOpen, setOthersOpen] = useState(false)
  const value = lists[list]
  if (!isRuleList(value)) return <NoticeLine>This list holds entries that aren’t rules, so it shows under Other keys as raw JSON.</NoticeLine>
  const rules = value ?? []
  const otherLayers = (rule: string) => sources.find((s) => s.rule === rule)?.layers.filter((l) => l !== layer) ?? []
  const fromOthers = sources.filter((s) => !rules.includes(s.rule))
  const moveTargets = RULE_LISTS.filter((to) => to !== list && isRuleList(lists[to]))
  const move = (rule: string, to: RuleList) => {
    const changed = moveRule({ allow: rulesIn(lists.allow), ask: rulesIn(lists.ask), deny: rulesIn(lists.deny) }, rule, list, to)
    for (const [changedList, next] of Object.entries(changed)) onStage(ruleListKey(changedList as RuleList), next)
  }
  return (
    <div>
      {rules.length === 0 && <NoticeLine>No {LIST_NAMES[list]} rules in this layer.</NoticeLine>}
      {rules.map((rule) => {
        const risky = list === 'allow' && ruleRisk(rule) !== null
        const also = otherLayers(rule)
        return (
          <FormRow
            key={rule}
            label={describeRule(list, rule)}
            hint={rule}
            notes={
              (risky || also.length > 0) && (
                <>
                  {risky && <Badge tone="warning">Every command runs without asking</Badge>}
                  {also.length > 0 && <Badge tone="quiet">Also in {layerList(also)}</Badge>}
                </>
              )
            }
            control={
              <>
                <Select
                  label={`Move ${rule}`}
                  options={[{ value: NO_MOVE, label: 'Move to…' }, ...moveTargets.map((to) => ({ value: to, label: LIST_NAMES[to] }))]}
                  value={NO_MOVE}
                  disabled={disabled}
                  onChange={(to) => to !== NO_MOVE && move(rule, to as RuleList)}
                />
                {!disabled && (
                  <IconButton label={`Remove ${rule}`} tooltip="Remove the rule from this layer" onClick={() => onStage(ruleListKey(list), rules.filter((r) => r !== rule))}>
                    <X size={12} />
                  </IconButton>
                )}
              </>
            }
          />
        )
      })}
      {fromOthers.length > 0 && (
        <CollapsibleSection level="group" title={`From other layers (${fromOthers.length})`} open={othersOpen} onToggle={() => setOthersOpen(!othersOpen)}>
          {fromOthers.map(({ rule, layers }) => (
            <FormRow key={rule} label={describeRule(list, rule)} hint={rule} notes={<Badge tone="quiet">From {layerList(layers)}</Badge>} control={null} />
          ))}
        </CollapsibleSection>
      )}
      <RuleBuilder list={list} rules={rules} disabled={disabled} onAdd={(rule) => onStage(ruleListKey(list), [...rules, rule])} />
    </div>
  )
}
