import { posix } from 'node:path'

// A port of the extension's @-mention file search (`Mur`, `ZQ`, `XQ` in extension.js).

export const MAX_MENTION_RESULTS = 100
const INDEX_RESULTS = 1000
const MAX_QUERY = 64

/** Every parent folder of the files, as `dir/`, ahead of the files themselves (`Uur`). */
export function withFolders(files: readonly string[]): string[] {
  const folders = new Set<string>()
  for (const file of files) {
    for (let slash = file.indexOf('/'); slash !== -1; slash = file.indexOf('/', slash + 1)) folders.add(file.slice(0, slash))
  }
  return [...[...folders].map((f) => f + '/'), ...files]
}

const isLetter = (code: number) => code >= 97 && code <= 122
const isUpper = (code: number) => code >= 65 && code <= 90
const isSeparator = (code: number) => code === 47 || code === 92 || code === 45 || code === 95 || code === 46 || code === 32

function boundaryBonus(path: string, at: number): number {
  if (at === 0) return 8
  const before = path.charCodeAt(at - 1)
  if (isSeparator(before)) return 8
  if (isLetter(before) && isUpper(path.charCodeAt(at))) return 6
  return 0
}

function bonusAt(path: string, positions: Int32Array, count: number): number {
  let sum = 0
  for (let i = 0; i < count; i++) sum += boundaryBonus(path, positions[i])
  return sum
}

/** Gap score of the query matched from the basename on, or -Infinity. */
function basenameScore(text: string, chars: readonly string[], from: number, out: Int32Array): number {
  let score = 0
  let last = from - 1
  for (let i = 0; i < chars.length; i++) {
    const at = text.indexOf(chars[i], last + 1)
    if (at === -1) return -Infinity
    out[i] = at
    const gap = at - last - 1
    if (i > 0) score += gap === 0 ? 4 : -(3 + gap)
    last = at
  }
  return score
}

interface Candidate {
  index: number
  fuzz: number
}

export class FileIndex {
  private readonly paths: string[]
  private readonly lower: string[]
  private readonly letters: Int32Array
  private readonly lengths: Uint16Array
  private readonly baseStart: Uint16Array
  private readonly baseLetters: Int32Array
  private readonly positions = new Int32Array(MAX_QUERY)
  private readonly basePositions = new Int32Array(MAX_QUERY)

  constructor(list: readonly string[]) {
    this.paths = [...new Set(list.filter((p) => p.length > 0))]
    const n = this.paths.length
    this.lower = new Array<string>(n)
    this.letters = new Int32Array(n)
    this.lengths = new Uint16Array(n)
    this.baseStart = new Uint16Array(n)
    this.baseLetters = new Int32Array(n)
    this.paths.forEach((path, i) => {
      const lower = path.toLowerCase()
      this.lower[i] = lower
      let letters = 0
      let start = 0
      let base = 0
      for (let k = 0; k < lower.length; k++) {
        const code = lower.charCodeAt(k)
        if (isLetter(code)) {
          letters |= 1 << (code - 97)
          base |= 1 << (code - 97)
        } else if ((code === 47 || code === 92) && k < lower.length - 1) {
          start = k + 1
          base = 0
        }
      }
      this.letters[i] = letters
      this.lengths[i] = lower.length
      this.baseStart[i] = lower.length === path.length ? start : 0
      this.baseLetters[i] = base
    })
  }

  /** Best first; `score` runs from 0 (best) towards 1, nudged down for paths containing "test". */
  search(query: string, limit: number): { path: string; score: number }[] {
    if (limit <= 0 || query.length === 0) return []
    const smartCase = query !== query.toLowerCase()
    const count = Math.min(query.length, MAX_QUERY)
    const chars: string[] = []
    let mask = 0
    for (let i = 0; i < count; i++) {
      const ch = query.charAt(i)
      chars.push(ch)
      const code = ch.charCodeAt(0)
      if (isLetter(code)) mask |= 1 << (code - 97)
    }
    const ceiling = count * 24 + 8 + 32
    const top: Candidate[] = []
    let floor = -Infinity
    const pos = this.positions
    const basePos = this.basePositions
    outer: for (let v = 0; v < this.paths.length; v++) {
      if ((this.letters[v] & mask) !== mask) continue
      const text = smartCase ? this.paths[v] : this.lower[v]
      let at = text.indexOf(chars[0])
      if (at === -1) continue
      pos[0] = at
      let gaps = 0
      let runs = 0
      let last = at
      for (let k = 1; k < count; k++) {
        at = text.indexOf(chars[k], last + 1)
        if (at === -1) continue outer
        pos[k] = at
        const gap = at - last - 1
        if (gap === 0) runs += 4
        else gaps += 3 + gap
        last = at
      }
      const start = this.baseStart[v]
      const base =
        gaps > 0 && pos[0] < start && (this.baseLetters[v] & mask) === mask ? basenameScore(text, chars, start, basePos) : -Infinity
      if (top.length === limit && ceiling + Math.max(runs - gaps, base) <= floor) continue
      const path = this.paths[v]
      let fuzz = runs - gaps + bonusAt(path, pos, count)
      if (base !== -Infinity) fuzz = Math.max(fuzz, base + bonusAt(path, basePos, count))
      fuzz += count * 16 + Math.max(0, 32 - (this.lengths[v] >> 2))
      if (top.length < limit) {
        top.push({ index: v, fuzz })
        if (top.length === limit) {
          top.sort((a, b) => a.fuzz - b.fuzz)
          floor = top[0].fuzz
        }
      } else if (fuzz > floor) {
        let lo = 0
        let hi = top.length
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          if (top[mid].fuzz < fuzz) lo = mid + 1
          else hi = mid
        }
        top.splice(lo, 0, { index: v, fuzz })
        top.shift()
        floor = top[0].fuzz
      }
    }
    top.sort((a, b) => b.fuzz - a.fuzz)
    return top.map((c, rank) => {
      const path = this.paths[c.index]
      const score = rank / top.length
      return { path, score: path.includes('test') ? Math.min(score * 1.05, 1) : score }
    })
  }
}

interface Folder {
  root: string
  paths: string[]
  index?: FileIndex
}

export interface MentionListing {
  paths: string[]
  folders: Map<string, Folder>
}

/** `paths` are workspace-relative with `/`; folders are added here. */
export function createListing(files: readonly string[]): MentionListing {
  const paths = withFolders(files)
  return { paths, folders: new Map([['', { root: '', paths }]]) }
}

/** Paths for the text typed after `@`, best first; folders end in `/`. */
export function mentionMatches(listing: MentionListing, query: string): string[] {
  const typed = query.replaceAll('\\', '/').toLowerCase().replace(/^\.?\//, '')
  const dir = typed.slice(0, typed.lastIndexOf('/') + 1)
  let scope = listing.folders.get(dir)
  if (!scope) {
    const root = listing.paths.find((p) => p.toLowerCase() === dir)
    scope = { root: root ?? '', paths: root ? listing.paths.filter((p) => p.startsWith(root)) : [] }
    listing.folders.set(dir, scope)
  }
  const prefix = scope.paths.length > 0 ? dir : ''
  const folder = listing.folders.get(prefix) ?? scope
  const { root } = folder
  const rest = typed.slice(prefix.length)
  if (!rest) {
    return folder.paths
      .filter((p) => !p.slice(root.length, -1).includes('/'))
      .sort()
      .slice(0, MAX_MENTION_RESULTS)
  }
  folder.index ??= new FileIndex(folder.paths.map((p) => p.slice(root.length)))
  const ranked = folder.index
    .search(rest, INDEX_RESULTS)
    .sort((a, b) => a.score - b.score)
    .map((hit) => root + hit.path)
  const name = typed.slice(dir.length)
  const tier = (p: string) => {
    const { base, name: stem } = posix.parse(p.toLowerCase())
    if (base !== name && stem !== name) return 2
    return p.includes('test') ? 1 : 0
  }
  return ranked
    .map((path, i) => ({ path, i, tier: tier(path) }))
    .sort((a, b) => a.tier - b.tier || a.i - b.i)
    .map((r) => r.path)
    .slice(0, MAX_MENTION_RESULTS)
}
