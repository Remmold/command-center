import { randomBytes } from 'node:crypto'
import { request } from 'node:http'
import type { Socket } from 'node:net'

/**
 * Reads ComfyUI's `/ws` text messages for one client id. Only what ComfyUI sends is handled: unmasked, unfragmented
 * server frames; binary preview frames are skipped and pings answered. Returns the stop.
 */
export function watchComfyMessages(port: number, clientId: string, onMessage: (message: unknown) => void): () => void {
  let socket: Socket | null = null
  let stopped = false
  const req = request({
    host: '127.0.0.1',
    port,
    path: `/ws?clientId=${encodeURIComponent(clientId)}`,
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': randomBytes(16).toString('base64')
    }
  })
  req.on('upgrade', (_res, sock, head) => {
    if (stopped) return void sock.destroy()
    socket = sock
    let buf: Buffer = head
    sock.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      for (;;) {
        const frame = readFrame(buf)
        if (!frame) break
        buf = buf.subarray(frame.size)
        if (frame.opcode === 1) {
          try {
            onMessage(JSON.parse(frame.payload.toString('utf8')))
          } catch {
            /* not JSON */
          }
        } else if (frame.opcode === 9) sock.write(maskedFrame(10, frame.payload))
        else if (frame.opcode === 8) sock.end()
      }
    })
    sock.on('error', () => undefined)
  })
  req.on('error', () => undefined)
  req.end()
  return () => {
    stopped = true
    req.destroy()
    socket?.destroy()
  }
}

function readFrame(buf: Buffer): { opcode: number; payload: Buffer; size: number } | null {
  if (buf.length < 2) return null
  const opcode = buf[0] & 0x0f
  let length = buf[1] & 0x7f
  let at = 2
  if (length === 126) {
    if (buf.length < 4) return null
    length = buf.readUInt16BE(2)
    at = 4
  } else if (length === 127) {
    if (buf.length < 10) return null
    length = Number(buf.readBigUInt64BE(2))
    at = 10
  }
  if (buf.length < at + length) return null
  return { opcode, payload: buf.subarray(at, at + length), size: at + length }
}

/** Client frames must be masked. */
function maskedFrame(opcode: number, payload: Buffer): Buffer {
  const mask = randomBytes(4)
  const body = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]))
  const head = payload.length < 126 ? Buffer.from([0x80 | opcode, 0x80 | payload.length]) : Buffer.from([0x80 | opcode, 0x80 | 126, payload.length >> 8, payload.length & 0xff])
  return Buffer.concat([head, mask, body])
}

/** The sampling step in a ComfyUI `progress` message. */
export function progressStep(message: unknown): { step: number; steps: number } | null {
  if (typeof message !== 'object' || message === null) return null
  const m = message as { type?: unknown; data?: { value?: unknown; max?: unknown } }
  if (m.type !== 'progress' || typeof m.data?.value !== 'number' || typeof m.data.max !== 'number') return null
  return { step: m.data.value, steps: m.data.max }
}
