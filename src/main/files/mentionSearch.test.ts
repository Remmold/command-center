import { describe, expect, it } from 'vitest'
import { createListing, mentionMatches, withFolders } from './mentionSearch'

const FILES = [
  'README.md',
  'package.json',
  'src/app.ts',
  'src/components/Button.tsx',
  'src/components/button.test.tsx',
  'src/components/Card.tsx',
  'src/utils/format.ts',
  'my folder/notes.md',
  'test/button.ts'
]

const listing = () => createListing(FILES)

describe('withFolders', () => {
  it('puts every parent folder, with a trailing slash, before the files', () => {
    expect(withFolders(['a/b/c.ts', 'a/d.ts', 'e.ts'])).toEqual(['a/', 'a/b/', 'a/b/c.ts', 'a/d.ts', 'e.ts'])
  })
})

describe('mentionMatches', () => {
  it('lists the top level, sorted, for an empty query', () => {
    expect(mentionMatches(listing(), '')).toEqual(['README.md', 'my folder/', 'package.json', 'src/', 'test/'])
  })

  it('lists the direct children of a typed folder', () => {
    expect(mentionMatches(listing(), 'src/')).toEqual(['src/', 'src/app.ts', 'src/components/', 'src/utils/'])
  })

  it('matches a typed folder case-insensitively and keeps the real case', () => {
    expect(mentionMatches(createListing(['Docs/a.md']), 'docs/')).toEqual(['Docs/', 'Docs/a.md'])
  })

  it('narrows a fuzzy query to the typed folder', () => {
    const hits = mentionMatches(listing(), 'src/comp')
    expect(hits[0]).toBe('src/components/')
    expect(hits.every((p) => p.startsWith('src/'))).toBe(true)
  })

  it('ranks an exact basename first, and the copy under test below it', () => {
    const hits = mentionMatches(listing(), 'button.tsx')
    expect(hits[0]).toBe('src/components/Button.tsx')
    expect(hits).toContain('src/components/button.test.tsx')
  })

  it('finds folders by name', () => {
    expect(mentionMatches(listing(), 'utils')[0]).toBe('src/utils/')
  })

  it('needs every query letter in order', () => {
    expect(mentionMatches(listing(), 'zzz')).toEqual([])
    expect(mentionMatches(listing(), 'fmt')).toEqual(['src/utils/format.ts'])
  })

  it('prefers a run of letters at a word start over the same letters scattered', () => {
    const hits = mentionMatches(createListing(['cxaxrxd.ts', 'cards.ts']), 'card')
    expect(hits).toEqual(['cards.ts', 'cxaxrxd.ts'])
  })

  it('returns at most 100 paths', () => {
    const many = Array.from({ length: 300 }, (_, i) => `f${i}.ts`)
    expect(mentionMatches(createListing(many), 'f')).toHaveLength(100)
    expect(mentionMatches(createListing(many), '')).toHaveLength(100)
  })

  it('accepts backslashes and a leading ./', () => {
    expect(mentionMatches(listing(), '.\\src\\')).toEqual(['src/', 'src/app.ts', 'src/components/', 'src/utils/'])
  })
})
