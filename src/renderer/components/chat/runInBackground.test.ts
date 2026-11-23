import { describe, expect, it } from 'vitest'
import { BACKGROUND_DISABLED, applyForegroundEvent, backgroundOutcome, foregroundIds, outcomeMessage, type ForegroundCalls } from './runInBackground'

const NONE: ForegroundCalls = new Map()
const started = (fields: Record<string, unknown>) => ({ type: 'system', subtype: 'task_started', task_id: 'b1', tool_use_id: 'toolu_1', task_type: 'local_bash', is_backgrounded: false, ...fields })

describe('calls that can move to the background', () => {
  it('is a shell or agent call the CLI started in the foreground', () => {
    expect(foregroundIds(applyForegroundEvent(NONE, started({})), ['toolu_1'])).toEqual(['toolu_1'])
    expect(foregroundIds(applyForegroundEvent(NONE, started({ task_type: 'local_agent' })), ['toolu_1'])).toEqual(['toolu_1'])
  })

  it('leaves out a call already in the background, one kept out of the transcript, and other task types', () => {
    expect(applyForegroundEvent(NONE, started({ is_backgrounded: true })).size).toBe(0)
    expect(applyForegroundEvent(NONE, started({ skip_transcript: true })).size).toBe(0)
    expect(applyForegroundEvent(NONE, started({ task_type: 'remote_agent' })).size).toBe(0)
    expect(applyForegroundEvent(NONE, started({ tool_use_id: undefined })).size).toBe(0)
  })

  it('drops a call once it moves to the background or ends', () => {
    const calls = applyForegroundEvent(NONE, started({}))
    const moved = { type: 'system', subtype: 'task_updated', task_id: 'b1', patch: { is_backgrounded: true } }
    const ended = { type: 'system', subtype: 'task_updated', task_id: 'b1', patch: { status: 'completed' } }
    const notified = { type: 'system', subtype: 'task_notification', task_id: 'b1', status: 'completed' }
    expect(applyForegroundEvent(calls, moved).size).toBe(0)
    expect(applyForegroundEvent(calls, ended).size).toBe(0)
    expect(applyForegroundEvent(calls, notified).size).toBe(0)
    expect(applyForegroundEvent(calls, { type: 'system', subtype: 'task_updated', task_id: 'b1', patch: { description: 'x' } })).toBe(calls)
  })

  it('keeps only the asked ids that are in the foreground', () => {
    const calls = applyForegroundEvent(NONE, started({}))
    expect(foregroundIds(calls, ['toolu_2', 'toolu_1'])).toEqual(['toolu_1'])
    expect(foregroundIds(NONE, ['toolu_1'])).toEqual([])
  })
})

describe('the answer to background_tasks', () => {
  it('is moved when the CLI backgrounded it, or answered without saying', () => {
    expect(backgroundOutcome([{ ok: true, response: { backgrounded: true } }])).toBe('moved')
    expect(backgroundOutcome([{ ok: true }])).toBe('moved')
  })

  it('is not found when the CLI had nothing to move', () => {
    expect(backgroundOutcome([{ ok: true, response: { backgrounded: false } }])).toBe('not_found')
  })

  it('is disabled when the session turned background tasks off, failed on any other error', () => {
    expect(backgroundOutcome([{ ok: false, error: BACKGROUND_DISABLED }])).toBe('disabled')
    expect(backgroundOutcome([{ ok: false, error: 'boom' }])).toBe('failed')
  })

  it('reads in the extension’s words', () => {
    expect(outcomeMessage('not_found')).toBe('Could not move this to the background. It may have just finished or already be running in the background.')
    expect(outcomeMessage('disabled')).toBe('Moving to the background is turned off for this session.')
    expect(outcomeMessage('failed')).toBe('Could not move this to the background. Try again.')
  })
})
