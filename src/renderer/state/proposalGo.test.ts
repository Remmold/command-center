import { describe, expect, it } from 'vitest'
import { onePerName } from './proposalGo'

describe('onePerName', () => {
  it('starts nothing for a second press of the same name while the first is starting', async () => {
    const started: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const go = onePerName(async (r: { name: string }) => {
      started.push(r.name)
      await gate
      return null
    })
    const first = go({ name: 'Login' })
    const second = await go({ name: 'login' })
    expect(second).toEqual({ ran: false })
    release()
    expect(await first).toEqual({ ran: true, error: null })
    expect(started).toEqual(['Login'])
  })

  it('lets the name start again once the first finished, and passes its error on', async () => {
    const go = onePerName(async () => 'boom')
    expect(await go({ name: 'a' })).toEqual({ ran: true, error: 'boom' })
    expect(await go({ name: 'a' })).toEqual({ ran: true, error: 'boom' })
  })
})
