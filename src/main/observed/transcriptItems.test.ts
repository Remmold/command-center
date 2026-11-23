import { describe, expect, it } from 'vitest'
import { createTranscriptParser, imageInLine, transcriptLinesToItems, withTranscriptSource } from './transcriptItems'

const base = {
  isSidechain: false,
  userType: 'external',
  entrypoint: 'claude-vscode',
  cwd: 'c:\\work\\repo',
  sessionId: 's1',
  version: '2.1.329',
  gitBranch: 'main',
  timestamp: '2026-11-21T14:02:05.745Z'
}

const humanPrompt = {
  ...base,
  parentUuid: null,
  type: 'user',
  uuid: 'u1',
  origin: { kind: 'human' },
  message: {
    role: 'user',
    content: [
      { type: 'text', text: '<ide_opened_file>The user opened a.ts</ide_opened_file>' },
      { type: 'text', text: 'fix the drawer' }
    ]
  }
}

const thinking = {
  ...base,
  parentUuid: 'u1',
  type: 'assistant',
  uuid: 'a1',
  message: {
    model: 'claude-opus-5-5',
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'thinking', thinking: '', signature: 'sig' }]
  }
}

const toolUse = {
  ...thinking,
  parentUuid: 'a1',
  uuid: 'a2',
  message: {
    ...thinking.message,
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: 'a.ts' } }]
  }
}

const toolResult = {
  ...base,
  parentUuid: 'a2',
  type: 'user',
  uuid: 'u2',
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file body' }]
  },
  toolUseResult: { type: 'text' },
  sourceToolAssistantUUID: 'a2'
}

const reply = {
  ...thinking,
  parentUuid: 'u2',
  uuid: 'a3',
  message: { ...thinking.message, id: 'msg_2', content: [{ type: 'text', text: 'Done.' }] }
}

const metaReminder = {
  ...base,
  parentUuid: 'a3',
  type: 'user',
  uuid: 'u3',
  isMeta: true,
  message: { role: 'user', content: '<system-reminder>\nRead\n</system-reminder>' }
}

const slashCommand = {
  ...base,
  parentUuid: 'a3',
  type: 'user',
  uuid: 'u4',
  message: {
    role: 'user',
    content: '<command-message>tdd</command-message>\n<command-name>/tdd</command-name>'
  }
}

const bookkeeping = [
  { type: 'queue-operation', operation: 'enqueue', sessionId: 's1' },
  { type: 'ai-title', aiTitle: 'Drawer fix', sessionId: 's1' },
  { type: 'last-prompt', lastPrompt: 'fix the drawer', sessionId: 's1' },
  { type: 'file-history-snapshot', messageId: 'u1', snapshot: {} },
  { type: 'api-request-blob', message: { role: 'user', content: [{ type: 'text', text: 'raw' }] } },
  { ...base, type: 'attachment', uuid: 'x1', attachment: { type: 'environment' } }
]

function jsonl(lines: object[]): string {
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
}

describe('createTranscriptParser', () => {
  it('maps a VS Code turn onto chat items, skipping meta and bookkeeping lines', () => {
    const parser = createTranscriptParser()
    const items = parser.push(
      jsonl([bookkeeping[0], humanPrompt, thinking, toolUse, toolResult, ...bookkeeping.slice(1), reply, metaReminder])
    )
    const at = Date.parse(base.timestamp)
    expect(items).toEqual([
      { kind: 'user', id: 'u1', text: 'fix the drawer', at },
      {
        kind: 'assistant',
        id: 'a1',
        content: [{ type: 'thinking', thinking: '', signature: 'sig' }],
        raw: expect.objectContaining({ type: 'assistant' }),
        at
      },
      {
        kind: 'assistant',
        id: 'a2',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: 'a.ts' } }],
        raw: expect.objectContaining({ type: 'assistant' }),
        at
      },
      { kind: 'tool_result', id: 'u2:0', toolUseId: 'toolu_1', content: 'file body', isError: undefined, at },
      {
        kind: 'assistant',
        id: 'a3',
        content: [{ type: 'text', text: 'Done.' }],
        raw: expect.objectContaining({ type: 'assistant' }),
        at
      }
    ])
  })

  it('leaves the time off a line without a valid timestamp', () => {
    const items = createTranscriptParser().push(jsonl([{ ...slashCommand, timestamp: 'not a time' }]))
    expect(items).toEqual([{ kind: 'user', id: 'u4', text: '/tdd' }])
  })

  it('shows a slash command as the command typed', () => {
    const items = createTranscriptParser().push(jsonl([slashCommand]))
    expect(items).toEqual([{ kind: 'user', id: 'u4', text: '/tdd', at: Date.parse(base.timestamp) }])
  })

  it('holds back a partial last line until the rest of it arrives', () => {
    const parser = createTranscriptParser()
    const text = jsonl([humanPrompt, reply])
    const cut = text.length - 20
    const first = parser.push(text.slice(0, cut))
    expect(first.map((i) => i.id)).toEqual(['u1'])
    const second = parser.push(text.slice(cut))
    expect(second.map((i) => i.id)).toEqual(['a3'])
  })

  it('keeps a multi-byte character split across two reads intact', () => {
    const parser = createTranscriptParser()
    const bytes = Buffer.from(jsonl([{ ...humanPrompt, message: { role: 'user', content: 'café → ok' } }]))
    const split = bytes.indexOf(Buffer.from('→')) + 1
    expect(parser.push(bytes.subarray(0, split))).toEqual([])
    expect(parser.push(bytes.subarray(split))).toEqual([{ kind: 'user', id: 'u1', text: 'café → ok', at: Date.parse(base.timestamp) }])
  })

  it('skips a malformed line and carries on', () => {
    const items = createTranscriptParser().push('{"type":"user", broken\n' + jsonl([reply]))
    expect(items.map((i) => i.id)).toEqual(['a3'])
  })

  it('shortens a huge tool result', () => {
    const big = { ...toolResult, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'y'.repeat(50_000) }] } }
    const [item] = createTranscriptParser().push(jsonl([big]))
    expect(item.kind).toBe('tool_result')
    const content = (item as { content: string }).content
    expect(content.length).toBeLessThan(25_000)
    expect(content.endsWith('… (shortened)')).toBe(true)
  })

  it('times a thinking block from the line before it to its own line, as the CLI writes each block when it ends', () => {
    const request = { type: 'api-request', timestamp: '2026-11-21T14:02:06.000Z' }
    const thought = { ...thinking, timestamp: '2026-11-21T14:02:08.400Z' }
    const items = createTranscriptParser().push(jsonl([humanPrompt, request, thought]))
    expect(items[1]).toMatchObject({ id: 'a1', thinkingMs: { 0: 2400 } })
  })

  it('times a thinking block across two reads', () => {
    const parser = createTranscriptParser()
    parser.push(jsonl([humanPrompt]))
    const [item] = parser.push(jsonl([{ ...thinking, timestamp: '2026-11-21T14:02:07.745Z' }]))
    expect(item).toMatchObject({ thinkingMs: { 0: 2000 } })
  })

  it('leaves a thinking block untimed with nothing timed before it, or no time between', () => {
    expect(createTranscriptParser().push(jsonl([thinking]))[0]).not.toHaveProperty('thinkingMs')
    expect(createTranscriptParser().push(jsonl([humanPrompt, thinking]))[1]).not.toHaveProperty('thinkingMs')
  })

  it('times blocks the same way when a tail is read in one batch', () => {
    const lines = jsonl([humanPrompt, { ...thinking, timestamp: '2026-11-21T14:02:09.745Z' }]).split('\n')
    expect(transcriptLinesToItems(lines)[1]).toMatchObject({ thinkingMs: { 0: 4000 } })
  })

  it('turns a compaction boundary and its summary into the compaction line', () => {
    const boundary = {
      ...base,
      type: 'system',
      subtype: 'compact_boundary',
      uuid: 'c1',
      content: 'Conversation compacted',
      compactMetadata: { trigger: 'auto', preTokens: 974_400, postTokens: 18_000 }
    }
    const summary = { ...base, type: 'user', uuid: 'c2', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued…' } }
    const at = Date.parse(base.timestamp)
    expect(createTranscriptParser().push(jsonl([boundary, summary]))).toEqual([
      { kind: 'system', id: 'c1', text: '', compact: { trigger: 'auto', preTokens: 974_400 }, at },
      { kind: 'system', id: 'c2', text: '', compactSummary: 'This session is being continued…', at }
    ])
  })
})

describe('attachments on a transcript prompt', () => {
  const png = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }
  const sheet = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' } }
  const prompt = (content: unknown[]) => ({ ...humanPrompt, message: { role: 'user', content } })
  const at = Date.parse(base.timestamp)

  it('names each image, document and video by where its original sits, never copying the data', () => {
    const items = transcriptLinesToItems([
      JSON.stringify(
        prompt([
          { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'hello' }, title: 'notes.txt' },
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBE' }, title: 'paper.pdf' },
          sheet,
          sheet,
          { type: 'text', text: 'Video: clip.mp4 · 0:06 · 12 frames on 2 sheets\nSheet 1: 0:00\nSheet 2: 0:03' },
          png,
          { type: 'text', text: 'look' }
        ])
      )
    ])
    expect(items).toEqual([
      {
        kind: 'user',
        id: 'u1',
        text: 'look',
        at,
        attachments: [
          { kind: 'text', name: 'notes.txt', mediaType: 'text/plain' },
          { kind: 'pdf', name: 'paper.pdf', mediaType: 'application/pdf' },
          { kind: 'video', name: 'clip.mp4', mediaType: 'image/jpeg', transcript: { block: 2 } },
          { kind: 'image', name: 'image 1', mediaType: 'image/png', transcript: { block: 5 } }
        ]
      }
    ])
    expect(JSON.stringify(items)).not.toContain('iVBORw0KGgo')
  })

  it('keeps an image-only prompt', () => {
    expect(transcriptLinesToItems([JSON.stringify(prompt([png, png]))])).toEqual([
      {
        kind: 'user',
        id: 'u1',
        text: '',
        at,
        attachments: [
          { kind: 'image', name: 'image 1', mediaType: 'image/png', transcript: { block: 0 } },
          { kind: 'image', name: 'image 2', mediaType: 'image/png', transcript: { block: 1 } }
        ]
      }
    ])
  })

  it('are told which chat they came from, so the original can be read again after a restart', () => {
    const [item] = transcriptLinesToItems([JSON.stringify(prompt([png, { type: 'text', text: 'look' }]))])
    const [user, other] = withTranscriptSource([item, { kind: 'system', id: 'n', text: 'x' }], 'w1', 's1')
    expect(user).toMatchObject({ attachments: [{ transcript: { block: 0, workspaceId: 'w1', sessionId: 's1' } }] })
    expect(other).toEqual({ kind: 'system', id: 'n', text: 'x' })
  })

  it('read back as the original image, from its line and block only', () => {
    const line = JSON.stringify(prompt([{ type: 'text', text: 'a' }, png]))
    expect(imageInLine(line, 'u1', 1)).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(imageInLine(line, 'u1', 0)).toBeNull()
    expect(imageInLine(line, 'other', 1)).toBeNull()
    expect(imageInLine('{broken', 'u1', 1)).toBeNull()
  })
})
