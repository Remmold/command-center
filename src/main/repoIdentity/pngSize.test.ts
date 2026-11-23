import { describe, expect, it } from 'vitest'
import { pngSize } from './pngSize'

function header(width: number, height: number): Buffer {
  const b = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b)
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

describe('pngSize', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(pngSize(header(1024, 512))).toEqual({ width: 1024, height: 512 })
  })

  it('is null for anything that is not a PNG header', () => {
    expect(pngSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(pngSize(header(16, 16).subarray(0, 20))).toBeNull()
  })
})
