import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CardField, type CardFieldProps } from './ActionCardShell'

const BRIEF = ['Export the report as CSV.', '', '- one column per field', '- a header row', '', '```ts', 'exportCsv(report)', '```'].join('\n')

const field = (props: Omit<CardFieldProps, 'children'>, text: string): string => renderToStaticMarkup(createElement(CardField, { ...props, children: text }))

describe('a card field', () => {
  it('draws long free text as the chat draws a reply: a list and a code block', () => {
    const html = field({ label: 'Starting brief', markdown: true }, BRIEF)
    expect(html).toMatch(/<ul[^>]*>\s*<li[^>]*>one column per field<\/li>/)
    expect(html).toMatch(/<pre[^>]*><code class="[^"]*language-ts/)
    expect(html).toContain('exportCsv')
    expect(html).not.toContain('```')
  })

  it('keeps the quote bar of a verbatim message drawn as markdown, without the code look', () => {
    const html = field({ label: 'Message', verbatim: true, markdown: true }, BRIEF)
    expect(html).toContain('border-l-[3px]')
    expect(html).not.toMatch(/<dd[^>]*font-mono/)
    expect(html).toContain('<pre')
  })

  it('leaves a short field as plain text', () => {
    const html = field({ label: 'Name' }, '- add-export')
    expect(html).not.toContain('<ul')
    expect(html).toContain('- add-export')
  })
})
