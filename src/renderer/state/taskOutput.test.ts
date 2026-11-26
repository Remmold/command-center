import { describe, expect, it } from 'vitest'
import { outputStep, type TaskOutput } from './taskOutput'

const out = (output: string, truncated = false, totalBytes = Buffer.byteLength(output)): TaskOutput => ({ output, totalBytes, truncated })

describe("a Claude process's output in a terminal", () => {
  it('writes the whole output on the first poll', () => {
    expect(outputStep(null, out('Listening on http://localhost:47831\n'))).toEqual({ kind: 'append', text: 'Listening on http://localhost:47831\n' })
  })

  it('appends only what was added since the last poll', () => {
    expect(outputStep(out('one\n'), out('one\ntwo\n'))).toEqual({ kind: 'append', text: 'two\n' })
  })

  it('writes nothing when no bytes were added', () => {
    expect(outputStep(out('one\n'), out('one\n'))).toEqual({ kind: 'none' })
    expect(outputStep(out('tail', true, 9000), out('tail', true, 9000))).toEqual({ kind: 'none' })
  })

  it('rewrites the panel when the output was cut', () => {
    expect(outputStep(out('one\n'), out('…two\nthree\n', true, 90_000))).toEqual({ kind: 'rewrite', text: '…two\nthree\n' })
  })

  it('rewrites the panel when the text no longer starts with what was written', () => {
    expect(outputStep(out('progress 10%'), out('progress 20%\n'))).toEqual({ kind: 'rewrite', text: 'progress 20%\n' })
  })
})
