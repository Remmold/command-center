import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const SCANNED_DIRS = ['src/renderer']
const SCANNED_FILES = ['index.html', 'tailwind.config.js']
const EXTENSIONS = ['.ts', '.tsx', '.css', '.html']
const ZINC = /\bzinc-\d{2,3}\b/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return EXTENSIONS.some((ext) => name.endsWith(ext)) ? [path] : []
  })
}

function zincHits(): string[] {
  const files = [...SCANNED_DIRS.flatMap((d) => walk(join(ROOT, d))), ...SCANNED_FILES.map((f) => join(ROOT, f))]
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (ZINC.test(line) ? [`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`] : []))
  )
}

describe('theme', () => {
  it('uses semantic colour names instead of literal zinc classes', () => {
    expect(zincHits()).toEqual([])
  })
})
