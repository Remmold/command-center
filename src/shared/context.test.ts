import { describe, expect, it } from 'vitest'
import { estimateTokens, formatTokens, splitFrontmatter } from './context'

describe('token estimate', () => {
  it('is characters divided by four, rounded', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcdef')).toBe(2)
    expect(estimateTokens('abcde')).toBe(1)
  })

  it('reads as ~N below a thousand and ~N.Nk from there', () => {
    expect(formatTokens(0)).toBe('~0')
    expect(formatTokens(999)).toBe('~999')
    expect(formatTokens(1000)).toBe('~1.0k')
    expect(formatTokens(4200)).toBe('~4.2k')
    expect(formatTokens(12_345)).toBe('~12.3k')
  })
})

describe('frontmatter split', () => {
  it('takes a closed leading block apart from the body, CRLF included', () => {
    expect(splitFrontmatter('---\r\nname: flow\r\ndescription: "Runs it"\r\n---\r\n# Flow\r\nbody')).toEqual({
      meta: { name: 'flow', description: 'Runs it' },
      body: '# Flow\nbody'
    })
  })

  it('leaves the text whole when the block never closes or holds no key', () => {
    expect(splitFrontmatter('---\nname: flow\n# Flow')).toEqual({ meta: {}, body: '---\nname: flow\n# Flow' })
    expect(splitFrontmatter('---\n- a list\n---\nbody')).toEqual({ meta: {}, body: '---\n- a list\n---\nbody' })
    expect(splitFrontmatter('# Plain\n---\nname: x\n---')).toEqual({ meta: {}, body: '# Plain\n---\nname: x\n---' })
  })
})
