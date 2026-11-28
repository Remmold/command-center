import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseModel3dRequest } from '../../shared/model3d'

describe('a request written by the model3d skill', () => {
  it('parses with every field gen3d.py sets, run anyway included', () => {
    const raw: unknown = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'gen3d-request.json'), 'utf8'))

    const parsed = parseModel3dRequest(raw)

    expect(parsed).toEqual({
      ok: true,
      request: {
        id: '20261128-101500-1a2b3c4d',
        kind: 'generate',
        argv: ['--image', 'axe.png', '--force'],
        cwd: 'C:\\projects\\game',
        python: 'C:\\Python312\\python.exe',
        script: 'C:\\Users\\remmold\\.claude\\skills\\model3d\\scripts\\gen3d.py',
        waiterPid: 4242,
        wait: true,
        sessionId: 'session-7',
        configDir: '',
        submittedAt: '2026-11-28T10:15:00.123Z',
        summary: 'axe.png · prop',
        runAnyway: true
      }
    })
  })
})
