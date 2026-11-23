const SIGNATURE_AND_IHDR = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

export const PNG_HEADER_BYTES = 24

export function pngSize(head: Buffer): { width: number; height: number } | null {
  if (head.length < PNG_HEADER_BYTES || !head.subarray(0, SIGNATURE_AND_IHDR.length).equals(SIGNATURE_AND_IHDR)) return null
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
}
