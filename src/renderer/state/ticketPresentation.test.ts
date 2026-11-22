import { describe, expect, it } from 'vitest'
import type { BoardColumn } from '../../shared/types'
import { showsSessionStatus, statusRepeatsColumn, ticketBody } from './ticketPresentation'

const t = (status: string | null, column: BoardColumn, statusKnown = true) => ({ status, column, statusKnown })

describe('statusRepeatsColumn', () => {
  it('is true for the word that only restates the column', () => {
    expect(statusRepeatsColumn(t('in-progress', 'in-progress'))).toBe(true)
    expect(statusRepeatsColumn(t('claimed', 'in-progress'))).toBe(true)
    expect(statusRepeatsColumn(t('resolved', 'done'))).toBe(true)
    expect(statusRepeatsColumn(t('blocked', 'blocked'))).toBe(true)
  })

  it('is false when the word says more than the column', () => {
    expect(statusRepeatsColumn(t('wontfix', 'done'))).toBe(false)
    expect(statusRepeatsColumn(t('ready-for-agent', 'blocked'))).toBe(false)
    expect(statusRepeatsColumn(t('ready-for-human', 'backlog'))).toBe(false)
    expect(statusRepeatsColumn(t('needs-triage', 'backlog'))).toBe(false)
  })

  it('keeps every backlog word, a missing word and an unknown word', () => {
    expect(statusRepeatsColumn(t('ready-for-agent', 'backlog'))).toBe(false)
    expect(statusRepeatsColumn(t(null, 'backlog'))).toBe(false)
    expect(statusRepeatsColumn(t('talking', 'in-progress', false))).toBe(false)
  })
})

describe('showsSessionStatus', () => {
  it('only for cards in progress', () => {
    expect(showsSessionStatus('in-progress')).toBe(true)
    for (const c of ['backlog', 'blocked', 'done'] as const) expect(showsSessionStatus(c)).toBe(false)
  })
})

describe('ticketBody', () => {
  it('drops the title heading and the Status and Blocked by lines the drawer already shows', () => {
    const md = '# 03: Rotate keys\n\n**Blocked by:** 01, 02\n\n**Status:** in-progress\n\n- [ ] Rotate keys\n'
    expect(ticketBody(md)).toBe('- [ ] Rotate keys\n')
  })

  it('keeps later headings, plain-text fields and other prose', () => {
    const md = 'Status: blocked — waiting\nBlocked by: None\n\n## What to build\n\nThe status: field is parsed.\n'
    expect(ticketBody(md)).toBe('## What to build\n\nThe status: field is parsed.\n')
  })

  it('leaves a field line inside a code fence alone', () => {
    const md = '# 01: x\n\n```\nStatus: in-progress\n```\n'
    expect(ticketBody(md)).toBe('```\nStatus: in-progress\n```\n')
  })

  it('keeps a field-like line once the body has started', () => {
    const md = '# 02: x\n\n**Status:** blocked\n\n- [ ] step\n- Status: shown in the list\n'
    expect(ticketBody(md)).toBe('- [ ] step\n- Status: shown in the list\n')
  })

  it('removes only the first level-1 heading', () => {
    expect(ticketBody('# A\n\ntext\n\n# B\n')).toBe('text\n\n# B\n')
  })
})
