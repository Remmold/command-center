import { describe, expect, it } from 'vitest'
import { nameProblem, proposeSlug } from './featureName'

describe('proposeSlug', () => {
  it('turns a description into a short folder-safe slug', () => {
    expect(proposeSlug('Add a Login page with email + password!')).toBe('add-a-login-page-with')
  })
  it('is empty when the description has no usable words', () => {
    expect(proposeSlug('  !!! ')).toBe('')
  })
  it('never ends with a dash after cutting', () => {
    expect(proposeSlug('aaaaaaaaaaaaaaaaaaaaaaa b').endsWith('-')).toBe(false)
  })
})

describe('nameProblem', () => {
  it('accepts a plain slug', () => {
    expect(nameProblem('login-page', [])).toBeNull()
  })
  it('refuses an empty name', () => {
    expect(nameProblem('', [])).toMatch(/needs a name/i)
  })
  it('refuses characters that are not valid in a folder and branch name', () => {
    expect(nameProblem('Login Page', [])).toMatch(/lowercase letters/i)
    expect(nameProblem('a/b', [])).toMatch(/lowercase letters/i)
    expect(nameProblem('-lead', [])).toMatch(/lowercase letters/i)
  })
  it('refuses a name another feature has, whatever its case', () => {
    expect(nameProblem('login', ['Login'])).toMatch(/already/i)
  })
})
