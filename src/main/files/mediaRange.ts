export interface ByteRange {
  start: number
  end: number
  /** True when the request named a range, so the reply is a 206. */
  partial: boolean
}

/** The bytes a `Range: bytes=…` header asks for, inclusive; null when it cannot be served. */
export function byteRange(header: string | null, size: number): ByteRange | null {
  if (!header) return { start: 0, end: size - 1, partial: false }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return null
  if (match[1] === '') {
    const length = Math.min(Number(match[2]), size)
    return { start: size - length, end: size - 1, partial: true }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (start >= size || end < start) return null
  return { start, end, partial: true }
}
