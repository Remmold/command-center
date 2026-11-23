import { describe, expect, it } from 'vitest'
import type { AssistantMessageItem, ChatItem, ToolResultItem } from './types'
import { collectMedia, mediaAttachments } from './chatMedia'

const CWD = 'C:\\work\\repo'

function call(id: string, name: string, input: unknown, at = 1): AssistantMessageItem {
  const content = [{ type: 'tool_use' as const, id: `${id}-call`, name, input }]
  return { kind: 'assistant', id, content, raw: { type: 'assistant', message: { id, role: 'assistant', content } }, at } as AssistantMessageItem
}

function reply(id: string, text: string, at = 1): AssistantMessageItem {
  const content = [{ type: 'text' as const, text }]
  return { kind: 'assistant', id, content, raw: { type: 'assistant', message: { id, role: 'assistant', content } }, at } as AssistantMessageItem
}

function result(id: string, toolUseId: string, content: unknown, at = 1): ToolResultItem {
  return { kind: 'tool_result', id, toolUseId, content, at }
}

const paths = (items: ChatItem[], cwd: string | undefined = CWD) =>
  collectMedia({ items, cwd }).map((m) => (m.source.kind === 'file' ? m.source.path : m.source.dataUrl))

describe('collecting a chat media', () => {
  it('takes the file a Read, Write or Edit call names', () => {
    const media = collectMedia({
      items: [call('a', 'Read', { file_path: 'C:\\work\\repo\\shot.png' }, 10)],
      cwd: CWD
    })
    expect(media).toEqual([
      { key: 'c:/work/repo/shot.png', kind: 'image', name: 'shot.png', at: 10, messageId: 'a', source: { kind: 'file', path: 'C:\\work\\repo\\shot.png' } }
    ])
    expect(paths([call('b', 'Write', { file_path: 'out/clip.mp4' }), call('c', 'Edit', { file_path: 'icon.svg' })])).toEqual([
      'C:\\work\\repo\\icon.svg',
      'C:\\work\\repo\\out\\clip.mp4'
    ])
  })

  it('ignores files that are neither images nor videos, and other tools', () => {
    expect(paths([call('a', 'Read', { file_path: 'src/a.ts' }), call('b', 'Bash', { command: 'ls' }), call('c', 'Grep', { pattern: 'x.png' })])).toEqual([])
  })

  it('tells videos from images by extension, ignoring case', () => {
    const kinds = collectMedia({
      items: ['a.PNG', 'b.jpg', 'c.jpeg', 'd.gif', 'e.webp', 'f.svg', 'g.bmp', 'h.MP4', 'i.webm', 'j.mov', 'k.mkv'].map((f, i) =>
        call(`m${i}`, 'Read', { file_path: f }, i)
      ),
      cwd: CWD
    }).map((m) => `${m.name}:${m.kind}`)
    expect(kinds).toEqual([
      'k.mkv:video', 'j.mov:video', 'i.webm:video', 'h.MP4:video',
      'g.bmp:image', 'f.svg:image', 'e.webp:image', 'd.gif:image', 'c.jpeg:image', 'b.jpg:image', 'a.PNG:image'
    ])
  })

  it('finds image paths in tool output text, such as a Blender or MCP result, and jumps to the call', () => {
    const media = collectMedia({
      items: [
        call('a', 'mcp__blender__render', {}, 1),
        result('r', 'a-call', [{ type: 'text', text: 'Saved render to D:\\renders\\frame_001.png (1920x1080). Also wrote ./preview.webp.' }], 2)
      ],
      cwd: CWD
    })
    expect(media.map((m) => [m.source.kind === 'file' && m.source.path, m.messageId, m.at])).toEqual([
      ['C:\\work\\repo\\preview.webp', 'a', 2],
      ['D:\\renders\\frame_001.png', 'a', 2]
    ])
    expect(paths([call('a', 'Bash', {}), result('r', 'a-call', 'wrote out/a.png')])).toEqual(['C:\\work\\repo\\out\\a.png'])
  })

  it('finds file links and paths in Claude replies, not web addresses', () => {
    expect(
      paths([
        reply('a', 'See [the shot](Logs/shot.png#L1), `assets/logo.svg` and C:/work/repo/docs/demo.mov. Not https://example.com/cat.png or www.x.com/y.gif.')
      ])
    ).toEqual(['C:\\work\\repo\\docs\\demo.mov', 'C:\\work\\repo\\assets\\logo.svg', 'C:\\work\\repo\\Logs\\shot.png'])
  })

  it('reads a percent-encoded link as the file it names', () => {
    expect(paths([reply('a', '[clip](media/my%20clip.mp4)')])).toEqual(['C:\\work\\repo\\media\\my clip.mp4'])
  })

  it('jumps from a subagent mention to the Agent call that ran it', () => {
    const agent = call('top', 'Agent', { prompt: 'x' }, 1)
    const inner = { ...call('sub', 'Read', { file_path: 'x.png' }, 2), parentToolUseId: 'top-call' }
    expect(collectMedia({ items: [agent, inner], cwd: CWD })[0].messageId).toBe('top')
  })

  it('keeps one tile per file, at its newest mention, however the path was written', () => {
    const media = collectMedia({
      items: [
        call('a', 'Write', { file_path: 'C:\\work\\repo\\out\\shot.png' }, 1),
        reply('b', 'Saved `out/shot.png`, see also ./other.gif', 2),
        reply('c', 'Here it is again: c:/WORK/repo/./out/../out/shot.png', 3)
      ],
      cwd: CWD
    })
    expect(media.map((m) => [m.name, m.messageId, m.at])).toEqual([
      ['shot.png', 'c', 3],
      ['other.gif', 'b', 2]
    ])
  })

  it('leaves out a relative path when the chat has no workspace, but keeps absolute ones', () => {
    expect(paths([reply('a', 'a.png and /home/me/b.png')], '')).toEqual(['/home/me/b.png'])
  })

  it('shows the user’s pasted images under the prompt that sent them, from their data', () => {
    const user: ChatItem = { kind: 'user', id: 'u1', text: 'look', at: 5 }
    const media = collectMedia({
      items: [call('a', 'Read', { file_path: 'x.png' }, 1), user, reply('b', 'nice', 6)],
      cwd: CWD,
      attachments: [
        { id: 'att-1', messageId: 'u1', name: 'pasted.png', kind: 'image', source: { kind: 'data', dataUrl: 'data:image/png;base64,AAA' } },
        { id: 'att-2', messageId: 'never-sent', name: 'gone.png', kind: 'image', source: { kind: 'data', dataUrl: 'data:image/png;base64,BBB' } }
      ]
    })
    expect(media).toEqual([
      { key: 'att-1', kind: 'image', name: 'pasted.png', at: 5, messageId: 'u1', source: { kind: 'data', dataUrl: 'data:image/png;base64,AAA' } },
      expect.objectContaining({ name: 'x.png' })
    ])
  })
})

describe('keeping a prompt’s pasted images for the Media panel', () => {
  it('keeps the images as data under the prompt, and drops other files', () => {
    expect(
      mediaAttachments('u1', [
        { kind: 'image', mediaType: 'image/png', base64: 'AAA', name: 'pasted.png' },
        { kind: 'text', mediaType: 'text/plain', base64: 'BBB', name: 'notes.txt' }
      ])
    ).toEqual([{ id: 'u1#0', messageId: 'u1', name: 'pasted.png', kind: 'image', source: { kind: 'data', dataUrl: 'data:image/png;base64,AAA' } }])
  })

  it('keeps a video by its path and its sheets as data, the original first in the panel', () => {
    const attachments = mediaAttachments('u1', [
      { kind: 'video', name: 'clip.mp4', sheets: [{ base64: 'S1', width: 1, height: 1 }], text: 'Video: clip.mp4', sourcePath: 'C:/v/clip.mp4' },
      { kind: 'video', name: 'pasted.webm', sheets: [], text: 'Video: pasted.webm', sourcePath: null }
    ])
    expect(attachments).toEqual([
      { id: 'u1#0.1', messageId: 'u1', name: 'clip.mp4 · sheet 1', kind: 'image', source: { kind: 'data', dataUrl: 'data:image/jpeg;base64,S1' } },
      { id: 'u1#0', messageId: 'u1', name: 'clip.mp4', kind: 'video', source: { kind: 'file', path: 'C:/v/clip.mp4' } }
    ])
    const user: ChatItem = { kind: 'user', id: 'u1', text: 'watch', at: 5 }
    expect(collectMedia({ items: [user], cwd: CWD, attachments }).map((m) => m.name)).toEqual(['clip.mp4', 'clip.mp4 · sheet 1'])
  })
})
