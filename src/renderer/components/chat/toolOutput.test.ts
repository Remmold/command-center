import { describe, expect, it } from 'vitest'
import { errorLine, persistedOutput, readableOutput } from './toolOutput'

describe('the readable text of a tool result', () => {
  it('shows a JSON result’s message, with the whole JSON pretty-printed as raw', () => {
    const text = '{"message":"Successfully stopped task: b6nq4v7pb (pnpm dev)","task_id":"b6nq4v7pb"}'
    expect(readableOutput(text)).toEqual({
      text: 'Successfully stopped task: b6nq4v7pb (pnpm dev)',
      raw: '{\n  "message": "Successfully stopped task: b6nq4v7pb (pnpm dev)",\n  "task_id": "b6nq4v7pb"\n}'
    })
  })

  it('shows a JSON result’s result field', () => {
    expect(readableOutput('{"result":"Code executed successfully: [\'a.png\']"}').text).toBe("Code executed successfully: ['a.png']")
  })

  it('keeps JSON with neither field as it came, raw pretty-printed', () => {
    expect(readableOutput('{"balance":1932}')).toEqual({ text: '{"balance":1932}', raw: '{\n  "balance": 1932\n}' })
  })

  it('leaves plain text alone and has no raw form', () => {
    expect(readableOutput('ok\n2 passed')).toEqual({ text: 'ok\n2 passed' })
    expect(readableOutput('{not json')).toEqual({ text: '{not json' })
    expect(readableOutput('42')).toEqual({ text: '42' })
  })
})

describe('the note of an output saved to a file', () => {
  const note = [
    '<persisted-output>',
    'Output too large (34.9KB). Full output saved to: C:\\Users\\me\\.claude\\projects\\c--x\\s1\\tool-results\\blwb2pgvl.txt',
    '',
    'Preview (first 2KB):',
    'untracked 2.3 MB',
    'warning: CRLF',
    '</persisted-output>'
  ].join('\n')

  it('reads the size, the file and the preview', () => {
    expect(persistedOutput(note)).toEqual({
      label: 'Output saved to file (34.9 KB)',
      path: 'C:\\Users\\me\\.claude\\projects\\c--x\\s1\\tool-results\\blwb2pgvl.txt',
      preview: 'untracked 2.3 MB\nwarning: CRLF'
    })
  })

  it('reads a note without a preview', () => {
    expect(persistedOutput('<persisted-output>\nOutput too large (1.2MB). Full output saved to: /tmp/out.txt\n</persisted-output>')).toEqual({
      label: 'Output saved to file (1.2 MB)',
      path: '/tmp/out.txt',
      preview: ''
    })
  })

  it('is null for any other text', () => {
    expect(persistedOutput('Output too large')).toBeNull()
    expect(persistedOutput('ok')).toBeNull()
  })
})

describe('the line a failed call shows while folded', () => {
  it('is the first line of the error, without the CLI’s tool_use_error tags', () => {
    expect(errorLine('<tool_use_error>File has not been read yet.\nRead it first.</tool_use_error>')).toBe('File has not been read yet.')
    expect(errorLine('\n\nExit code 1\nnpm ERR! missing script')).toBe('Exit code 1')
  })

  it('reads a JSON error’s message', () => {
    expect(errorLine('{"message":"No task found with ID: b1","task_id":"b1"}')).toBe('No task found with ID: b1')
  })
})
