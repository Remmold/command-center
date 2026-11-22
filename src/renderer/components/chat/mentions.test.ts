import { describe, expect, it } from 'vitest'
import { insertMention, mentionText, mentionTrigger } from './mentions'

describe('mentionTrigger', () => {
  it('opens on @ at the start or after whitespace, up to the end of the word', () => {
    expect(mentionTrigger('@src', 2)).toEqual({ start: 0, end: 4, query: 'src' })
    expect(mentionTrigger('look at @sr', 11)).toEqual({ start: 8, end: 11, query: 'sr' })
  })

  it('stays shut inside a word or away from the mention', () => {
    expect(mentionTrigger('me@mail', 7)).toBeNull()
    expect(mentionTrigger('@src and more', 10)).toBeNull()
  })
})

describe('mentionText', () => {
  it('writes plain paths bare and folders with their slash', () => {
    expect(mentionText('src/app.ts', 'file')).toBe('@src/app.ts')
    expect(mentionText('src/', 'directory')).toBe('@src/')
  })

  it('quotes paths with spaces or colons, and paths not ending in a word character', () => {
    expect(mentionText('my folder/notes.md', 'file')).toBe('@"my folder/notes.md"')
    expect(mentionText('my folder/', 'directory')).toBe('@"my folder/"')
    expect(mentionText('a:b.ts', 'file')).toBe('@"a:b.ts"')
    expect(mentionText('notes(1)', 'file')).toBe('@"notes(1)"')
  })

  it('refuses paths the CLI would read as another mention', () => {
    expect(mentionText('a#5.ts', 'file')).toBeNull()
    expect(mentionText('say "hi".txt', 'file')).toBeNull()
    expect(mentionText('~/x', 'file')).toBeNull()
    expect(mentionText(' lead.ts', 'file')).toBeNull()
  })
})

describe('insertMention', () => {
  it('replaces the typed mention, adds a space and puts the caret after it', () => {
    expect(insertMention('see @ap now', { start: 4, end: 7, query: 'ap' }, '@src/app.ts', true)).toEqual({
      value: 'see @src/app.ts  now',
      caret: 16
    })
  })

  it('keeps a space after the mention even at the end of the input', () => {
    expect(insertMention('@ap', { start: 0, end: 3, query: 'ap' }, '@app.ts', true)).toEqual({ value: '@app.ts  ', caret: 8 })
  })

  it('leaves the caret before the space when drilling into a folder', () => {
    expect(insertMention('@sr', { start: 0, end: 3, query: 'sr' }, '@src/', false)).toEqual({ value: '@src/ ', caret: 5 })
    expect(insertMention('@sr more', { start: 0, end: 3, query: 'sr' }, '@src/', false)).toEqual({ value: '@src/ more', caret: 5 })
  })
})
