import { describe, expect, it } from 'vitest'
import { inOrder, toEnd } from './order'

const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
const ids = (list: { id: string }[]) => list.map((x) => x.id)

describe('saved workspace order', () => {
  it('puts the saved workspaces in the given order', () => {
    expect(ids(inOrder(items, ['c', 'a', 'd', 'b']))).toEqual(['c', 'a', 'd', 'b'])
  })

  it('keeps a workspace the order leaves out, after the ones it names, and ignores unknown ids', () => {
    expect(ids(inOrder(items, ['d', 'x', 'b']))).toEqual(['d', 'b', 'a', 'c'])
  })

  it('moves a workspace to the end, so a new account lists it last', () => {
    expect(ids(toEnd(items, 'b'))).toEqual(['a', 'c', 'd', 'b'])
    expect(ids(toEnd(items, 'x'))).toEqual(['a', 'b', 'c', 'd'])
  })
})
