import { describe, expect, it } from 'vitest'
import { NEW_SESSION_TITLE, migratedTitle, titleAfterPrompt, titleAfterRename } from './sessionTitle'

const fresh = { title: NEW_SESSION_TITLE }

describe('session title', () => {
  it('is "New session" before any prompt', () => {
    expect(NEW_SESSION_TITLE).toBe('New session')
  })

  it('comes from the first line of the first prompt, whitespace collapsed', () => {
    expect(titleAfterPrompt(fresh, '  Fix   the\tlogin bug \nand add a test').title).toBe('Fix the login bug')
  })

  it('is cut to 60 characters, ending in "…", when the line is longer', () => {
    const sixty = 'a'.repeat(60)
    expect(titleAfterPrompt(fresh, sixty).title).toBe(sixty)
    const cut = titleAfterPrompt(fresh, 'Please read the whole board reader and explain how blockers are resolved').title
    expect(cut).toBe('Please read the whole board reader and explain how blockers…')
    expect(cut).toHaveLength(60)
  })

  it('is kept when later prompts arrive', () => {
    const first = titleAfterPrompt(fresh, 'Fix the login bug')
    expect(titleAfterPrompt(first, 'now add a test').title).toBe('Fix the login bug')
  })

  it('stays "New session" when the prompt has no text', () => {
    expect(titleAfterPrompt(fresh, ' \n ').title).toBe(NEW_SESSION_TITLE)
  })

  it('keeps a rename, before or after the first prompt', () => {
    const renamedEarly = titleAfterRename(fresh, '  Login work ')
    expect(renamedEarly.title).toBe('Login work')
    expect(titleAfterPrompt(renamedEarly, 'Fix the login bug').title).toBe('Login work')
    const renamedLate = titleAfterRename(titleAfterPrompt(fresh, 'Fix the login bug'), 'Auth')
    expect(titleAfterPrompt(renamedLate, 'more').title).toBe('Auth')
  })

  it('ignores a blank rename', () => {
    const named = titleAfterPrompt(fresh, 'Fix the login bug')
    expect(titleAfterRename(named, '   ')).toEqual(named)
  })

  describe('for sessions saved before titles existed', () => {
    it('comes from the first user message in the chat', () => {
      expect(migratedTitle(['', 'Fix the login bug\nplease'])).toBe('Fix the login bug')
    })

    it('is "New session" when the chat has no user message', () => {
      expect(migratedTitle([])).toBe(NEW_SESSION_TITLE)
    })
  })
})
