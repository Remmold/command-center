import { describe, expect, it } from 'vitest'
import { ApprovalBroker } from './approvals'
import type { ApprovalRequest } from '../../shared/approval'

const canUseTool = {
  subtype: 'can_use_tool',
  tool_name: 'Bash',
  display_name: 'Bash',
  input: { command: 'node -e "console.log(7)"', description: 'Print 7 with Node' },
  description: 'Print 7 with Node',
  permission_suggestions: [
    { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'node -e "console.log(7)"' }], behavior: 'allow', destination: 'localSettings' }
  ],
  decision_reason: 'This command requires approval',
  decision_reason_type: 'other',
  tool_use_id: 'toolu_1'
}

function setup() {
  const broker = new ApprovalBroker()
  const raised: ApprovalRequest[] = []
  const settled: string[] = []
  broker.onRaised((r) => raised.push(r))
  broker.onSettled((s) => settled.push(`${s.paneId}:${s.requestId}`))
  return { broker, raised, settled }
}

describe('ApprovalBroker', () => {
  it('raises the tool, its input and the suggestions, and answers with the choice and the tool use id', async () => {
    const { broker, raised, settled } = setup()
    const controller = new AbortController()
    const answer = broker.handlerFor('pane-1')(canUseTool, { requestId: 'cli-7', signal: controller.signal })
    expect(raised).toEqual([
      {
        requestId: 'cli-7',
        paneId: 'pane-1',
        toolName: 'Bash',
        input: canUseTool.input,
        suggestions: canUseTool.permission_suggestions,
        description: 'Print 7 with Node',
        raisedAt: expect.any(Number)
      }
    ])
    expect(broker.respond('cli-7', { behavior: 'allow', updatedInput: canUseTool.input, updatedPermissions: [] })).toBe(true)
    await expect(answer).resolves.toEqual({
      behavior: 'allow',
      updatedInput: canUseTool.input,
      updatedPermissions: [],
      toolUseID: 'toolu_1'
    })
    expect(settled).toEqual(['pane-1:cli-7'])
  })

  it('shows the reason only when the CLI asks for a safety check', () => {
    const { broker, raised } = setup()
    const signal = new AbortController().signal
    void broker.handlerFor('p')({ ...canUseTool, decision_reason_type: 'safetyCheck', decision_reason: 'Writes outside the project' }, { requestId: 'a', signal })
    expect(raised[0].reason).toBe('Writes outside the project')
  })

  it('drops the prompt when the CLI cancels it or the process exits', async () => {
    const { broker, settled } = setup()
    const controller = new AbortController()
    const answer = broker.handlerFor('pane-1')(canUseTool, { requestId: 'cli-7', signal: controller.signal })
    controller.abort()
    await expect(answer).rejects.toThrow('cancelled')
    expect(settled).toEqual(['pane-1:cli-7'])
    expect(broker.respond('cli-7', { behavior: 'deny', message: 'x', interrupt: true })).toBe(false)
  })

  it('lists the requests still waiting, so a reloaded window can show them again', () => {
    const { broker } = setup()
    const signal = new AbortController().signal
    void broker.handlerFor('pane-1')(canUseTool, { requestId: 'cli-7', signal })
    void broker.handlerFor('pane-2')(canUseTool, { requestId: 'cli-8', signal })
    broker.respond('cli-7', { behavior: 'deny', message: 'x', interrupt: true })
    expect(broker.list().map((r) => `${r.paneId}:${r.requestId}`)).toEqual(['pane-2:cli-8'])
  })

  it('refuses requests it does not know', async () => {
    const { broker, raised } = setup()
    const signal = new AbortController().signal
    await expect(broker.handlerFor('p')({ subtype: 'elicitation' }, { requestId: 'b', signal })).rejects.toThrow(
      'Unsupported control request: elicitation'
    )
    expect(raised).toEqual([])
  })
})
