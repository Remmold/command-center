import { describe, expect, it } from 'vitest'
import { dirnameOf } from './pathParts'

describe('dirnameOf', () => {
  it.each([
    ['C:\\Users\\a\\AppData\\preview-drafts\\x.json', 'C:\\Users\\a\\AppData\\preview-drafts'],
    ['/home/a/preview-drafts/x.json', '/home/a/preview-drafts'],
    ['C:/mixed\\drafts/x.json', 'C:/mixed\\drafts'],
    ['x.json', '']
  ])('takes the folder of %s', (file, folder) => {
    expect(dirnameOf(file)).toBe(folder)
  })
})
