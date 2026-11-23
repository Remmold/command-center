import { describe, expect, it } from 'vitest'
import { byteRange } from './mediaRange'

describe('the byte range a video request asks for', () => {
  it('is the whole file without a Range header', () => {
    expect(byteRange(null, 1000)).toEqual({ start: 0, end: 999, partial: false })
  })

  it('reads an open-ended, a closed and a suffix range', () => {
    expect(byteRange('bytes=100-', 1000)).toEqual({ start: 100, end: 999, partial: true })
    expect(byteRange('bytes=0-1', 1000)).toEqual({ start: 0, end: 1, partial: true })
    expect(byteRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999, partial: true })
  })

  it('clamps an end past the file and refuses a start past it', () => {
    expect(byteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999, partial: true })
    expect(byteRange('bytes=1000-', 1000)).toBeNull()
    expect(byteRange('bytes=abc', 1000)).toBeNull()
  })
})
