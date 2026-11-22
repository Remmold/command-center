import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasTeleportMarker, isTeleportedSession } from './teleport'

describe('hasTeleportMarker', () => {
  it('finds the teleported-from line and nothing else', () => {
    expect(hasTeleportMarker('{"type":"user"}\n{"type":"teleported-from","remoteSessionId":"s1"}\n')).toBe(true)
    expect(hasTeleportMarker('{"type":"teleported-from"}\n')).toBe(false)
    expect(hasTeleportMarker('{"type":"user","text":"\\"teleported-from\\""}\n')).toBe(false)
    expect(hasTeleportMarker('{"type":"assistant"}\n')).toBe(false)
  })
})

describe('isTeleportedSession', () => {
  it('reads the session transcript; a missing one is not teleported', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'teleport-'))
    writeFileSync(join(dir, 'a.jsonl'), '{"type":"teleported-from","remoteSessionId":"r"}\n')
    writeFileSync(join(dir, 'b.jsonl'), '{"type":"user"}\n')
    expect(await isTeleportedSession(dir, 'a')).toBe(true)
    expect(await isTeleportedSession(dir, 'b')).toBe(false)
    expect(await isTeleportedSession(dir, 'missing')).toBe(false)
    expect(await isTeleportedSession(dir, '../a')).toBe(false)
  })
})
