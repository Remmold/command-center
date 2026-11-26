import { describe, expect, it } from 'vitest'
import { accountMismatch, chatAccountView, hostedChatAccount, observedChatAccount } from './chatAccount'

const profiles = [
  { id: 'default', name: 'Default', configDir: 'C:\\Users\\me\\.claude' },
  { id: 'p-work', name: 'Work', configDir: 'C:\\Users\\me\\.claude-work' }
]

describe('the account of a hosted chat', () => {
  it('is the one the CLI reported in its initialize reply for the profile the process started on', () => {
    const account = hostedChatAccount({
      process: { profileId: 'p-work', account: { email: 'me@work.se', organization: 'Work AB', subscriptionType: 'team' } },
      workspaceProfileId: 'default',
      profiles
    })
    expect(account).toEqual({
      profileId: 'p-work',
      source: 'reported',
      email: 'me@work.se',
      organization: 'Work AB',
      plan: 'Team',
      configDir: 'C:\\Users\\me\\.claude-work'
    })
  })

  it('is the start profile, pending, before the reply arrives, even when the workspace moved since', () => {
    const account = hostedChatAccount({ process: { profileId: 'default', account: null }, workspaceProfileId: 'p-work', profiles })
    expect(account).toMatchObject({ profileId: 'default', source: 'pending', email: null, plan: null, configDir: 'C:\\Users\\me\\.claude' })
  })

  it('is the workspace account, pending, for a chat whose process has not started', () => {
    expect(hostedChatAccount({ process: null, workspaceProfileId: 'p-work', profiles })).toMatchObject({ profileId: 'p-work', source: 'pending' })
  })

  it('treats a profile the list no longer has as Default, as main does', () => {
    expect(hostedChatAccount({ process: null, workspaceProfileId: 'p-gone', profiles })).toMatchObject({ profileId: 'default' })
  })

  it('keeps the start profile, not Default, while the profile list has not loaded', () => {
    expect(hostedChatAccount({ process: { profileId: 'p-work', account: null }, workspaceProfileId: 'default', profiles: [] })).toMatchObject({ profileId: 'p-work', configDir: null })
  })
})

describe('the account of a chat that lives in VS Code', () => {
  const vscodeFolder = { folder: 'C:\\repo', profileName: 'Work', configDir: 'c:/users/me/.claude-work/' }

  it('is the account whose config folder holds the running session’s process file', () => {
    expect(observedChatAccount({ liveConfigDir: 'c:/users/me/.CLAUDE', vscodeFolder, profiles })).toMatchObject({
      profileId: 'default',
      source: 'live',
      configDir: 'c:/users/me/.CLAUDE'
    })
  })

  it('names no account when the live folder is not one of the app’s', () => {
    expect(observedChatAccount({ liveConfigDir: 'D:\\other', vscodeFolder, profiles })).toMatchObject({
      profileId: null,
      source: 'live',
      configDir: 'D:\\other'
    })
  })

  it('is probably the folder VS Code associates with the workspace when no process is live', () => {
    expect(observedChatAccount({ liveConfigDir: null, vscodeFolder, profiles })).toMatchObject({
      profileId: 'p-work',
      source: 'probably',
      vscodeProfileName: 'Work'
    })
  })

  it('is unknown with neither a live process nor an association', () => {
    expect(observedChatAccount({ liveConfigDir: null, vscodeFolder: undefined, profiles })).toMatchObject({ profileId: null, source: 'unknown', configDir: null })
  })
})

describe('mismatch between a hosted chat and its workspace', () => {
  it('names both accounts when the process runs on another account than the workspace is set to', () => {
    const chat = hostedChatAccount({ process: { profileId: 'default', account: null }, workspaceProfileId: 'p-work', profiles })
    expect(accountMismatch(chat, 'p-work', profiles)).toEqual({ runningOn: 'default', setTo: 'p-work' })
  })

  it('is none when they agree, also through the Default fallback', () => {
    const chat = hostedChatAccount({ process: { profileId: 'default', account: null }, workspaceProfileId: 'p-gone', profiles })
    expect(accountMismatch(chat, 'p-gone', profiles)).toBeNull()
  })

  it('is none for a chat with no running process or an unknown account', () => {
    expect(accountMismatch(hostedChatAccount({ process: null, workspaceProfileId: 'p-work', profiles }), 'p-work', profiles)).toBeNull()
    expect(accountMismatch(observedChatAccount({ liveConfigDir: null, vscodeFolder: undefined, profiles }), 'p-work', profiles)).toBeNull()
  })
})

describe('the badge words', () => {
  const accounts = [
    { profileId: 'default', name: 'Personal', plan: 'Max', label: 'Personal · Max' },
    { profileId: 'p-work', name: 'Work', plan: null, label: 'Work' }
  ]
  const usage = { 'p-work': { email: 'me@work.se', organization: 'Work AB' } }

  it('names the account and the plan Claude reported without its Claude prefix, and gives the full plan and its source on hover', () => {
    const chat = hostedChatAccount({
      process: { profileId: 'p-work', account: { email: 'me@work.se', organization: 'Work AB', subscriptionType: 'claude team' } },
      workspaceProfileId: 'p-work',
      profiles
    })
    expect(chatAccountView(chat, accounts, usage)).toEqual({
      label: 'Work · team',
      qualifier: null,
      tooltip: ['Work · Claude team', 'Email: me@work.se', 'Organization: Work AB', 'Config folder: C:\\Users\\me\\.claude-work', 'Reported by Claude'].join('\n')
    })
  })

  it('marks a pending start profile and fills the email from the usage check', () => {
    const chat = hostedChatAccount({ process: null, workspaceProfileId: 'p-work', profiles })
    expect(chatAccountView(chat, accounts, usage)).toMatchObject({
      label: 'Work',
      qualifier: 'pending',
      tooltip: expect.stringContaining('Email: me@work.se')
    })
    expect(chatAccountView(chat, accounts, usage).tooltip).toContain('Pending: the account this chat starts on, until Claude reports it')
  })

  it('names the default account by its short name even when Claude reported its email', () => {
    const chat = hostedChatAccount({ process: { profileId: 'default', account: { email: 'me@home.se', subscriptionType: 'max' } }, workspaceProfileId: 'default', profiles })
    const view = chatAccountView(chat, accounts, usage)
    expect(view.label).toBe('Personal · Max')
    expect(view.tooltip).toContain('Email: me@home.se')
  })

  it('says a VS Code guess is probable and names its VS Code profile', () => {
    const chat = observedChatAccount({ liveConfigDir: null, vscodeFolder: { folder: 'C:\\r', profileName: 'Work', configDir: 'C:\\Users\\me\\.claude-work' }, profiles })
    const view = chatAccountView(chat, accounts, usage)
    expect(view.qualifier).toBe('probably')
    expect(view.tooltip).toContain('Probably: VS Code profile Work')
  })

  it('says unknown account rather than guessing', () => {
    const view = chatAccountView(observedChatAccount({ liveConfigDir: 'D:\\x', vscodeFolder: undefined, profiles }), accounts, usage)
    expect(view.label).toBe('Unknown account')
    expect(view.tooltip).toContain('Config folder: D:\\x')
    expect(view.tooltip).toContain('From the running VS Code session')
  })
})
