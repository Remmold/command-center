import { describe, expect, it } from 'vitest'
import { interruptNote } from './interrupt'

describe('interruptNote', () => {
  it("words the CLI's interrupt markers as the extension does", () => {
    expect(interruptNote({ type: 'text', text: '[Request interrupted by user]' })).toBe('Interrupted')
    expect(interruptNote({ type: 'text', text: '[Request interrupted by user for tool use]' })).toBe('Tool interrupted')
  })

  it('leaves other user text alone', () => {
    expect(interruptNote({ type: 'text', text: 'hello' })).toBeNull()
    expect(interruptNote({ type: 'tool_result', tool_use_id: 't', content: '[Request interrupted by user]' })).toBeNull()
  })
})
