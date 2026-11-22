import { describe, expect, it } from 'vitest'
import { fileBaseName, fileKind, linkedFile } from './fileLinks'

describe('which Markdown link targets open a file', () => {
  it('opens a relative path with an extension, with its line range', () => {
    expect(linkedFile('src/main/index.ts')).toEqual({ path: 'src/main/index.ts' })
    expect(linkedFile('src/a.ts:12')).toEqual({ path: 'src/a.ts', startLine: 12 })
    expect(linkedFile('src/a.ts#L3-L9')).toEqual({ path: 'src/a.ts', startLine: 3, endLine: 9 })
    expect(linkedFile('Logs/meshy_refs/SM_Chr%20Blacksmith.png')).toEqual({ path: 'Logs/meshy_refs/SM_Chr Blacksmith.png' })
  })

  it('opens paths that start with / ./ ../ or end with a slash, and well-known folders', () => {
    expect(linkedFile('./README')?.path).toBe('./README')
    expect(linkedFile('../other/Makefile')?.path).toBe('../other/Makefile')
    expect(linkedFile('docs/')?.path).toBe('docs/')
    expect(linkedFile('packages/src')?.path).toBe('packages/src')
  })

  it('opens a Windows drive path, with backslashes or as a file URL', () => {
    expect(linkedFile('C:\\projects\\x\\shot.png')).toEqual({ path: 'C:/projects/x/shot.png' })
    expect(linkedFile('file:///c:/projects/x/a.ts#L4')).toEqual({ path: 'c:/projects/x/a.ts', startLine: 4 })
  })

  it('opens a heading link inside a Markdown file', () => {
    expect(linkedFile('docs/adr/0001.md#context')).toEqual({ path: 'docs/adr/0001.md', heading: 'context' })
  })

  it('leaves web links, anchors and plain words alone', () => {
    expect(linkedFile('https://example.com/a.png')).toBeNull()
    expect(linkedFile('mailto:a@b.c')).toBeNull()
    expect(linkedFile('#section')).toBeNull()
    expect(linkedFile('README')).toBeNull()
    expect(linkedFile('//server/share/a.txt')).toBeNull()
    expect(linkedFile('src\\a.ts')).toBeNull()
  })
})

describe('how a linked file opens', () => {
  it('previews images', () => {
    for (const p of ['a.png', 'b.JPG', 'c.jpeg', 'd.gif', 'e.webp', 'f.svg']) expect(fileKind(p)).toBe('image')
  })

  it('opens code and text in the editor', () => {
    for (const p of ['a.ts', 'README.md', 'x.json', 'Makefile', 'notes.txt', '.gitignore']) expect(fileKind(p)).toBe('text')
  })

  it('hands documents, media and archives to the system', () => {
    for (const p of ['a.pdf', 'b.zip', 'c.mp4', 'd.docx', 'e.exe', 'f.fbx', 'g.blend']) expect(fileKind(p)).toBe('other')
  })
})

describe('the name a tool row shows for a file', () => {
  it('is the last part of the path, with either slash', () => {
    expect(fileBaseName('Logs/synty/SM_Chr_Blacksmith_Male_01.png')).toBe('SM_Chr_Blacksmith_Male_01.png')
    expect(fileBaseName('C:\\projects\\a\\b.ts')).toBe('b.ts')
    expect(fileBaseName('b.ts')).toBe('b.ts')
  })
})
