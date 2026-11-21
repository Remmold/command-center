// A port of the extension's fuzzy index (`UU`/`NAe`/`RAe` in webview/index.js): Fuse.js-style
// Bitap matching with weighted keys. Lower scores are better; 0 is an exact match.

interface Piece {
  text: string
  offset: number
  ascii: Int32Array
  other: Map<number, number>
}

function charMask(piece: Piece, code: number): number {
  return code < 128 ? piece.ascii[code] : (piece.other.get(code) ?? 0)
}

/** Fewest edits for the piece anywhere in `text[from, to)`, as a fraction of its length. */
function bestDistance(piece: Piece, text: string, from: number, to: number, stopAt: number): number {
  const len = piece.text.length
  const last = len - 1
  let vp = -1
  let vn = 0
  let score = len
  let best = len
  for (let i = from; i < to && best > stopAt; i++) {
    const eq = charMask(piece, text.charCodeAt(i))
    const d0 = (((eq & vp) + vp) ^ vp) | eq | vn
    const hp = vn | ~(d0 | vp)
    const hn = vp & d0
    score += ((hp >>> last) & 1) - ((hn >>> last) & 1)
    if (score < best) best = score
    vn = (hp << 1) & d0
    vp = (hn << 1) | ~((hp << 1) | d0)
  }
  return best / len
}

function locatedScore(piece: Piece, text: string, threshold: number, row: Int32Array): number {
  const len = piece.text.length
  const expected = Math.min(piece.offset, text.length)
  const reach = Math.ceil(threshold * 100) + 1
  const from = Math.max(0, expected - reach)
  const to = Math.min(expected + reach + len, text.length)
  if (bestDistance(piece, text, from, to, 0) > threshold) return -1
  const topBit = 1 << (len - 1)
  let limit = threshold
  let score = 1
  let found = false
  for (let errors = 0; errors < len && errors / len <= limit; errors++) {
    const errorScore = errors / len
    let span = Math.floor((limit - errorScore) * 100) + 1
    while (errorScore + span / 100 > limit) span--
    const carry = errors === 0 ? 0 : -1
    let start = Math.max(0, expected - span)
    let j = Math.min(expected + span + len, text.length)
    let prev = row[j]
    let bits = ((1 << errors) - 1) << (len - errors)
    row[j] = bits
    while (j > start) {
      j--
      const old = row[j]
      bits = (((bits >>> 1) | topBit) & charMask(piece, text.charCodeAt(j))) | ((((old | prev) >>> 1) | topBit | prev) & carry)
      row[j] = bits
      prev = old
      if (bits & 1) {
        const distance = Math.abs(j - expected)
        score = errorScore + distance / 100
        if (distance <= span) {
          found = true
          limit = score
          span = distance
          start = Math.max(0, expected - distance - 1)
        }
        if (j <= expected) break
      }
    }
  }
  score = Math.max(0.001, score)
  return found ? score : -score
}

class Grader {
  private readonly pattern: string
  private readonly pieces: Piece[] = []
  private readonly row: Int32Array

  constructor(
    pattern: string,
    private readonly threshold: number
  ) {
    this.pattern = pattern.toLowerCase()
    this.row = new Int32Array(this.pattern.length + Math.ceil(threshold * 100) + 2)
    for (let i = 0; i < this.pattern.length; i += 32) {
      const offset = Math.max(0, Math.min(i, this.pattern.length - 32))
      const text = this.pattern.slice(offset, offset + 32)
      const piece: Piece = { text, offset, ascii: new Int32Array(128), other: new Map() }
      for (let k = 0; k < text.length; k++) {
        const code = text.charCodeAt(k)
        const mask = charMask(piece, code) | (1 << k)
        if (code < 128) piece.ascii[code] = mask
        else piece.other.set(code, mask)
      }
      this.pieces.push(piece)
    }
  }

  /** -1 for no match, else 0 (exact) up to the threshold. */
  grade(candidate: string): number {
    const text = candidate.toLowerCase()
    if (text === this.pattern) return 0
    let total = 0
    let matched = false
    for (const piece of this.pieces) {
      const s = locatedScore(piece, text, this.threshold, this.row)
      matched ||= s > 0
      total += Math.abs(s)
    }
    return matched ? total / this.pieces.length : -1
  }
}

export interface SearchKey<T> {
  get: (item: T) => string | readonly string[] | undefined
  weight: number
}

interface Entry {
  owner: number
  text: string
  weight: number
}

/** The extension's fuzzy search over weighted keys, best match first. */
export function fuzzySearch<T>(items: readonly T[], keys: readonly SearchKey<T>[], query: string, threshold: number): { item: T; score: number }[] {
  const entries: Entry[] = []
  items.forEach((item, owner) => {
    for (const key of keys) {
      const value = key.get(item)
      const texts = typeof value === 'string' ? [value] : value ? [...value].reverse() : []
      for (const text of texts) if (text.trim() !== '') entries.push({ owner, text, weight: key.weight })
    }
  })
  const grader = new Grader(query, threshold)
  const results: { owner: number; score: number }[] = []
  let current = -1
  for (const entry of entries) {
    const grade = grader.grade(entry.text)
    if (grade < 0) continue
    if (entry.owner !== current) {
      current = entry.owner
      results.push({ owner: entry.owner, score: 1 })
    }
    let words = 0
    for (let i = 0; i < entry.text.length; ) {
      const space = entry.text.indexOf(' ', i)
      if (space !== i) words++
      i = space < 0 ? entry.text.length : space + 1
    }
    const norm = Math.round((1 / Math.sqrt(words)) * 1000) / 1000
    results[results.length - 1].score *= (grade || Number.EPSILON) ** (entry.weight * norm)
  }
  return results.sort((a, b) => a.score - b.score).map((r) => ({ item: items[r.owner], score: r.score }))
}

/** True when the query, separators dropped, starts some run of the candidate's words. */
export function wordStartMatch(query: string, candidates: readonly string[], separators: RegExp = /[:_-]/g): boolean {
  const q = query.toLowerCase().trim().split(separators).join('')
  if (q === '') return false
  return candidates.some((c) => {
    const words = c.toLowerCase().split(separators).filter(Boolean)
    return words.some((_, i) => words.slice(i).join('').startsWith(q))
  })
}
