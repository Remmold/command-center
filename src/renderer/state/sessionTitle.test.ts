import { describe, expect, it } from 'vitest'
import {
  NEW_SESSION_TITLE,
  migratedTitle,
  titleAfterClaude,
  titleAfterPrompt,
  titleAfterRename,
  titleRequests,
  wantsClaudeTitle
} from './sessionTitle'

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

  describe('from Claude (generate_session_title)', () => {
    it('replaces the first-prompt title', () => {
      const named = titleAfterPrompt(fresh, 'fix the login bug please')
      const titled = titleAfterClaude(named, 'Fix login bug')
      expect(titled.title).toBe('Fix login bug')
      expect(titled.titleFromClaude).toBe(true)
    })

    it('never replaces a rename, made before or after it', () => {
      const renamed = titleAfterRename(titleAfterPrompt(fresh, 'fix it'), 'Auth')
      expect(titleAfterClaude(renamed, 'Fix login bug').title).toBe('Auth')
      const renamedLater = titleAfterRename(titleAfterClaude(fresh, 'Fix login bug'), 'Auth')
      expect(renamedLater.title).toBe('Auth')
      expect(titleAfterClaude(renamedLater, 'Other').title).toBe('Auth')
    })

    it('is kept once set; a later reply does not change it', () => {
      const titled = titleAfterClaude(fresh, 'Fix login bug')
      expect(titleAfterClaude(titled, 'Something else').title).toBe('Fix login bug')
    })

    it('ignores a blank title', () => {
      const named = titleAfterPrompt(fresh, 'fix it')
      expect(titleAfterClaude(named, '  ')).toEqual(named)
    })
  })

  describe('asking Claude for a title', () => {
    it('asks on the first prompt and the next two, until a title is set', () => {
      let asked = titleRequests()
      const answers: boolean[] = []
      for (let i = 0; i < 5; i++) {
        const next = wantsClaudeTitle(asked, fresh, i === 0)
        answers.push(next.ask)
        asked = next.requests
      }
      expect(answers).toEqual([true, true, true, false, false])
    })

    it('stops asking once the session has a title from Claude or a rename', () => {
      expect(wantsClaudeTitle(titleRequests(), titleAfterClaude(fresh, 'T'), true).ask).toBe(false)
      expect(wantsClaudeTitle(titleRequests(), titleAfterRename(fresh, 'T'), true).ask).toBe(false)
    })

    it('never asks for a session that was named before this process, e.g. a resumed one', () => {
      const resumed = titleAfterPrompt(fresh, 'old prompt')
      expect(wantsClaudeTitle(titleRequests(), resumed, false).ask).toBe(false)
    })
  })

  describe('of a session whose first prompt the app wrote', () => {
    const CHECK = 'Drift check: check that the context files below still match the code.'
    const TITLE = 'Drift check · This project'

    it("is the app's title for it, never the prompt's text", () => {
      expect(titleAfterPrompt(fresh, CHECK, TITLE).title).toBe(TITLE)
    })

    it('is the name the app gave a session it hosts again, before any prompt', () => {
      expect(titleAfterPrompt(fresh, '', TITLE).title).toBe(TITLE)
    })

    it('never asks Claude to name it from the app prompt, so a later typed prompt neither renames it nor asks', () => {
      const first = wantsClaudeTitle(titleRequests(), fresh, true, true)
      expect(first.ask).toBe(false)
      const named = titleAfterPrompt(fresh, CHECK, TITLE)
      expect(titleAfterPrompt(named, 'apply the fixes').title).toBe(TITLE)
      expect(wantsClaudeTitle(first.requests, named, false).ask).toBe(false)
    })

    it('keeps a rename the user made, before or after', () => {
      const renamed = titleAfterRename(fresh, 'Planning')
      expect(titleAfterPrompt(renamed, CHECK, TITLE).title).toBe('Planning')
      expect(titleAfterRename(titleAfterPrompt(fresh, CHECK, TITLE), 'Memory').title).toBe('Memory')
    })

    it('leaves a typed first prompt naming the session as before', () => {
      expect(titleAfterPrompt(fresh, 'Fix the login bug').title).toBe('Fix the login bug')
      expect(wantsClaudeTitle(titleRequests(), fresh, true).ask).toBe(true)
    })
  })
})
