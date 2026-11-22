import { describe, expect, it } from 'vitest'
import { attachmentKind, overLimitBy, overLimitNotice, promptContent, terminalSnapshots, unsupportedNotice, PROMPT_LIMIT } from './attachments'

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64')

describe('attachmentKind', () => {
  it('takes the four image types, PDF and text', () => {
    expect(attachmentKind('image/png', 'a.png')).toBe('image')
    expect(attachmentKind('image/webp', 'a.webp')).toBe('image')
    expect(attachmentKind('application/pdf', 'a.pdf')).toBe('pdf')
    expect(attachmentKind('text/csv', 'a.csv')).toBe('text')
    expect(attachmentKind('application/json', 'a')).toBe('text')
  })

  it('reads source files by extension or well-known name, whatever the browser called them', () => {
    expect(attachmentKind('video/mp2t', 'main.ts')).toBe('text')
    expect(attachmentKind('application/octet-stream', 'Dockerfile')).toBe('text')
    expect(attachmentKind('application/octet-stream', 'LICENSE')).toBe('text')
  })

  it('refuses other images and binaries', () => {
    expect(attachmentKind('image/bmp', 'a.bmp')).toBe('unsupported')
    expect(attachmentKind('application/zip', 'a.zip')).toBe('unsupported')
  })
})

describe('unsupportedNotice', () => {
  it('names up to three files, then counts the rest', () => {
    expect(unsupportedNotice([])).toBeNull()
    expect(unsupportedNotice(['a.zip'])).toBe(
      'Unsupported file type: a.zip. Supported types: images (PNG, JPG, GIF, WebP), text files, and PDFs. To reference unsupported files, please include its absolute file path in your prompt (using @ for paths inside your working directory, and entering the path for files outside).'
    )
    expect(unsupportedNotice(['a', 'b', 'c', 'd', 'e'])).toMatch(/^Unsupported file types: a, b, c and 2 more\. /)
  })
})

describe('the prompt limit', () => {
  it('counts characters over 50,000', () => {
    expect(overLimitBy('x'.repeat(PROMPT_LIMIT))).toBe(0)
    expect(overLimitBy('x'.repeat(PROMPT_LIMIT + 1))).toBe(1)
  })

  it("leaves the CLI's truncation note out of the count", () => {
    expect(overLimitBy('x'.repeat(PROMPT_LIMIT) + '\n\n[Message truncated - exceeded 50,000 character limit]')).toBe(0)
  })

  it('words the notice as the extension does', () => {
    expect(overLimitNotice('That paste', 1, 'nothing was added, paste less of it')).toBe(
      'That paste is 1 character over the limit of 50000 · nothing was added, paste less of it'
    )
    expect(overLimitNotice('Your prompt', 123456, 'shorten it to send')).toBe(
      'Your prompt is 123,456 characters over the limit of 50000 · shorten it to send'
    )
  })
})

describe('promptContent', () => {
  it('sends the text alone as one text block', () => {
    expect(promptContent('hi', [], [])).toEqual([{ type: 'text', text: 'hi' }])
  })

  it('puts attachments, then terminals, before the text', () => {
    const content = promptContent(
      'look @terminal:pwsh',
      [
        { kind: 'image', mediaType: 'image/png', base64: 'AAA', name: 'a.png' },
        { kind: 'pdf', mediaType: 'application/pdf', base64: 'BBB', name: 'b.pdf' },
        { kind: 'text', mediaType: 'text/plain', base64: b64('héllo'), name: 'c.txt' }
      ],
      [{ name: 'pwsh', contents: 'PS> ls' }]
    )
    expect(content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' }, title: 'b.pdf' },
      { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'héllo' }, title: 'c.txt' },
      { type: 'text', text: '<terminal name="pwsh">\nPS> ls\n</terminal>' },
      { type: 'text', text: 'look @terminal:pwsh' }
    ])
  })

  it('leaves the empty text out when only files are sent', () => {
    expect(promptContent('', [{ kind: 'image', mediaType: 'image/png', base64: 'AAA', name: 'a.png' }], [])).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }
    ])
  })
})

describe('terminalSnapshots', () => {
  const shells = [
    { id: 't1', label: 'pwsh' },
    { id: 't2', label: 'pwsh 2' }
  ]
  const read = (id: string) => (id === 't2' ? 'PS> second' : null)

  it('reads the shell whose label, spaces as underscores, is named', () => {
    expect(terminalSnapshots('see @terminal:pwsh_2', shells, read)).toEqual([{ name: 'pwsh_2', contents: 'PS> second' }])
  })

  it('drops unknown shells and shells with nothing to read', () => {
    expect(terminalSnapshots('@terminal:bash @terminal:pwsh', shells, read)).toEqual([])
  })
})
