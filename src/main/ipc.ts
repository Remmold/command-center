import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { IPC } from '../shared/ipc-channels'
import * as workspaces from './workspaces/store'
import * as profiles from './profiles/store'
import { transcriptsDirForCwd, transcriptsDirForWorkspace } from './profiles/transcripts'
import { ObservedService } from './observed/service'
import * as apps from './apps/store'
import { appManager } from './apps/manager'
import { ptyManager } from './pty/manager'
import { claudeManager } from './claude/manager'
import { listProjectFiles } from './files/lister'
import { findMentions } from './files/mentions'
import { saveAsDialog } from './files/save'
import { readProjectFile, writeProjectFile } from './files/io'
import { appendCustomTitle, cleanSessionTitle, listLocalSessions } from './claude/local-sessions'
import { readSubagentTranscript } from './claude/subagentTranscript'
import { isTeleportedSession } from './claude/teleport'
import { BoardService } from './board/service'
import { DiscoveryService } from './board/discoveryService'
import { getDiff, getStatus, getUntrackedFilePreview } from './git/service'
import { approvalBroker } from './claude/approvals'
import { readDefaultMode, readModelDefaults, saveModelDefaults } from './claude/userSettings'
import type { ApprovalReply } from '../shared/approval'
import { sessionStatusTracker } from './sessions/tracker'
import { UsageService } from './usage/service'
import { probeUsage } from './usage/probe'
import type { RateLimitInfo } from './usage/usageReply'
import { userDataPath } from './util/paths'
import { setScreenFocus } from './sessions/screenFocus'
import {
  DEFAULT_PROFILE_ID,
  type AddWorkspaceResult,
  type AdoptResult,
  type ClaudeStartOptions,
  type UserContentBlock,
  type ModelDefaultsPatch,
  type ScreenFocus,
  type SessionInitEnvelope,
  type SessionRename,
  type SubagentTranscriptRequest,
  type RenameResult
} from '../shared/types'
import type { RepoIdentityService } from './repoIdentity/service'
import type { StartWithWindowsControl } from './tray/startWithWindows'

let unsubscribers: Array<() => void> = []

interface IpcDeps {
  repoIdentities: RepoIdentityService
  startWithWindows: StartWithWindowsControl
}

export function registerIpc({ repoIdentities, startWithWindows }: IpcDeps): void {
  const board = new BoardService(workspaces.list, (model) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.BOARD_CHANGED, model)
    }
  })
  const refreshBoard = (): Promise<void> =>
    board.refresh().then(
      () => undefined,
      (err) => console.error('[board] refresh failed', err)
    )
  const firstRead = refreshBoard()
  ipcMain.handle(IPC.BOARD_GET, async () => {
    await firstRead
    return board.current()
  })
  ipcMain.handle(IPC.BOARD_READ_FILE, (_e, path: string) => board.readFile(path))
  unsubscribers.push(() => board.stop())

  const sendAll = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
  ipcMain.handle(IPC.START_WITH_WINDOWS_GET, () => startWithWindows.get())
  ipcMain.handle(IPC.START_WITH_WINDOWS_SET, (_e, checked: boolean) => startWithWindows.set(checked === true))
  startWithWindows.onChanged((state) => sendAll(IPC.START_WITH_WINDOWS_CHANGED, state))

  const observed = new ObservedService(
    workspaces.list,
    transcriptsDirForWorkspace,
    (sessions) => sendAll(IPC.OBSERVED_CHANGED, sessions),
    (event) => sendAll(IPC.OBSERVED_ITEMS, event)
  )
  observed.start()
  ipcMain.handle(IPC.OBSERVED_LIST, () => observed.list())
  ipcMain.on(IPC.OBSERVED_SET_HOSTED, (_e, sessionIds: string[]) => observed.setHosted(sessionIds))
  ipcMain.handle(IPC.OBSERVED_OPEN, (_e, workspaceId: string, sessionId: string) =>
    observed.open(workspaceId, sessionId)
  )
  ipcMain.on(IPC.OBSERVED_CLOSE, () => observed.close())
  unsubscribers.push(() => observed.stop())

  const discovery = new DiscoveryService(workspaces.list, (model) => sendAll(IPC.DISCOVERY_CHANGED, model))
  discovery.start()
  ipcMain.handle(IPC.DISCOVERY_GET, () => discovery.current())
  ipcMain.handle(IPC.DISCOVERY_RESCAN, () => discovery.rescan())
  ipcMain.handle(IPC.DISCOVERY_SET_ROOTS, (_e, roots: unknown) => {
    if (!Array.isArray(roots) || !roots.every((r) => typeof r === 'string')) throw new Error('scan roots must be strings')
    return discovery.setRoots(roots)
  })
  unsubscribers.push(() => discovery.stop())

  const workspacesChanged = (): void => {
    void refreshBoard()
    void observed.workspacesChanged()
    void discovery.rescan()
  }

  ipcMain.handle(IPC.WORKSPACES_LIST, () => workspaces.list())

  ipcMain.handle(IPC.WORKSPACES_ADD_PATH, async (_e, path: unknown): Promise<AddWorkspaceResult> => {
    if (typeof path !== 'string' || path.trim() === '') return { ok: false, error: 'No folder given' }
    const folder = resolve(path.trim())
    const stat = await fs.stat(folder).catch(() => null)
    if (!stat) return { ok: false, error: `${folder} does not exist` }
    if (!stat.isDirectory()) return { ok: false, error: `${folder} is not a folder` }
    const workspace = await workspaces.add(folder)
    workspacesChanged()
    return { ok: true, workspace }
  })

  ipcMain.handle(IPC.WORKSPACES_ADD, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory']
        })
    if (result.canceled || result.filePaths.length === 0) return null
    const added = await workspaces.add(result.filePaths[0])
    workspacesChanged()
    return added
  })

  ipcMain.handle(IPC.WORKSPACES_REMOVE, async (_event, id: string) => {
    await workspaces.remove(id)
    workspacesChanged()
  })

  ipcMain.handle(IPC.WORKSPACES_SET_PROFILE, async (_e, id: string, profileId: string) => {
    const updated = await workspaces.setProfile(id, profileId)
    void observed.workspacesChanged()
    return updated
  })

  ipcMain.handle(IPC.REPO_IDENTITIES_LIST, () => repoIdentities.list())
  ipcMain.handle(IPC.REPO_IDENTITIES_SET_NAME, (_e, key: string, name: string) =>
    repoIdentities.setDisplayName(key, name)
  )
  ipcMain.handle(IPC.REPO_IDENTITIES_SET_ICON, (_e, key: string, icon: unknown) => repoIdentities.setIcon(key, icon))
  ipcMain.handle(IPC.REPO_IDENTITIES_CHOOSE_IMAGE, async (event, key: string) => {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a repo icon',
      properties: ['openFile'],
      filters: [{ name: 'PNG or SVG image', extensions: ['png', 'svg'] }]
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return repoIdentities.importImage(key, result.filePaths[0])
  })
  ipcMain.on(IPC.REPO_IDENTITIES_SET_RENDERED, (_e, key: string, dataUrl: string) => {
    repoIdentities.setRendered(key, dataUrl).catch((err) => console.error('[repo icons] could not keep drawn icon', err))
  })

  ipcMain.handle(IPC.PROFILES_LIST, () => profiles.list())
  ipcMain.handle(IPC.PROFILES_CREATE, (_e, name: string) => profiles.create(name))
  ipcMain.handle(IPC.PROFILES_RENAME, (_e, id: string, name: string) => profiles.rename(id, name))
  ipcMain.handle(IPC.PROFILES_SUGGESTIONS, () => profiles.suggestions())
  const adopted = (result: AdoptResult): AdoptResult => {
    if (result.ok) usage.refresh()
    return result
  }
  ipcMain.handle(IPC.PROFILES_ADOPT, async (_e, path: string) => adopted(await profiles.adopt(path)))
  ipcMain.handle(IPC.PROFILES_CHOOSE_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = { title: 'Use existing Claude folder', properties: ['openDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return adopted(await profiles.adopt(result.filePaths[0]))
  })
  ipcMain.handle(IPC.PROFILES_REMOVE, async (_e, id: string) => {
    const removed = await profiles.remove(id)
    if (removed) usage.refresh()
    return removed
  })

  const usage = new UsageService({
    listProfiles: profiles.list,
    envFor: async (profileId) => (await profiles.prepareSession(profileId)).env,
    probe: probeUsage,
    probeDir: userDataPath('usage-probe'),
    onChange: (all) => sendAll(IPC.USAGE_CHANGED, all)
  })
  usage.start()
  ipcMain.handle(IPC.USAGE_LIST, () => usage.list())
  ipcMain.on(IPC.USAGE_REFRESH, (_e, profileId?: unknown) => usage.refresh(typeof profileId === 'string' ? profileId : undefined))
  unsubscribers.push(
    () => usage.stop(),
    claudeManager.onEvent((paneId, event) => {
      const type = (event as { type?: unknown } | null)?.type
      if (type === 'result') usage.turnEnded(claudeManager.profileOf(paneId))
      else if (type === 'rate_limit_event') {
        const info = (event as { rate_limit_info?: RateLimitInfo }).rate_limit_info
        if (info) usage.rateLimitEvent(claudeManager.profileOf(paneId), info)
      }
    })
  )

  ipcMain.handle(IPC.FILES_LIST, (_event, cwd: string) => listProjectFiles(cwd))
  ipcMain.handle(IPC.FILES_MENTIONS, (_event, cwd: string, query: string) => findMentions(cwd, query))

  // Managed apps (machine-wide launchers/servers — independent of any project)
  ipcMain.handle(IPC.APPS_LIST, () => apps.list())
  ipcMain.handle(IPC.APPS_ADD, (_e, app: Parameters<typeof apps.add>[0]) => apps.add(app))
  ipcMain.handle(IPC.APPS_REMOVE, (_e, id: string) => apps.remove(id))
  ipcMain.handle(IPC.APPS_START, async (_e, id: string, update?: boolean) => {
    const app = (await apps.list()).find((a) => a.id === id)
    if (!app) return { ok: false, error: 'unknown app' }
    return appManager.start(app, Boolean(update))
  })
  ipcMain.handle(IPC.APPS_STOP, async (_e, id: string) => {
    const app = (await apps.list()).find((a) => a.id === id)
    if (!app) return { ok: false, error: 'unknown app' }
    return appManager.stop(app)
  })
  ipcMain.handle(IPC.APPS_STATUS, async () => appManager.status(await apps.list()))

  unsubscribers.push(
    appManager.onOutput((id, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.APPS_OUTPUT, { id, data })
      }
    })
  )
  unsubscribers.push(
    appManager.onExit((id, exitCode) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.APPS_EXIT, { id, exitCode })
      }
    })
  )

  // PTY (shells only — claude no longer goes through here)
  ipcMain.handle(
    IPC.PTY_SPAWN,
    (
      _e,
      paneId: string,
      kind: Parameters<typeof ptyManager.spawn>[1],
      cwd: string,
      env?: Record<string, string>
    ) => ptyManager.spawn(paneId, kind, cwd, env)
  )
  ipcMain.on(IPC.PTY_WRITE, (_e, paneId: string, data: string) =>
    ptyManager.write(paneId, data)
  )
  ipcMain.on(IPC.PTY_RESIZE, (_e, paneId: string, cols: number, rows: number) =>
    ptyManager.resize(paneId, cols, rows)
  )
  ipcMain.on(IPC.PTY_KILL, (_e, paneId: string) => ptyManager.kill(paneId))

  unsubscribers.push(
    ptyManager.onData((paneId, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.PTY_DATA, { paneId, data })
      }
    })
  )
  unsubscribers.push(
    ptyManager.onExit((paneId, exitCode, signal) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed())
          win.webContents.send(IPC.PTY_EXIT, {
            paneId,
            exitCode,
            signal: signal ?? null
          })
      }
    })
  )

  // Claude (stream-json subprocess)
  ipcMain.handle(IPC.CLAUDE_START, async (_e, options: ClaudeStartOptions) => {
    const workspace = await workspaces.findByPath(options.cwd)
    if (!workspace) console.warn('[profiles] no workspace at', options.cwd, '- session runs on Default')
    const { profileId, env } = await profiles.prepareSession(workspace?.profileId ?? DEFAULT_PROFILE_ID)
    const teleported = options.resumeSessionId ? await isTeleportedSession(await transcriptsDirForCwd(options.cwd), options.resumeSessionId) : false
    return claudeManager.start({ ...options, profileEnv: env, profileId, teleported })
  })
  ipcMain.handle(
    IPC.CLAUDE_CONTROL,
    (_e, paneId: string, subtype: string, fields?: Record<string, unknown>) =>
      claudeManager.control(paneId, subtype, fields)
  )
  ipcMain.handle(IPC.CLAUDE_GET_INIT, (_e, paneId: string) => claudeManager.initOf(paneId))
  // App-made profiles hard-link Default's settings.json; an adopted folder keeps its own and is never written to.
  const userSettingsFile = (): string => join(profiles.defaultConfigDir(), 'settings.json')
  ipcMain.handle(IPC.CLAUDE_READ_DEFAULTS, () => readModelDefaults(userSettingsFile()))
  ipcMain.handle(IPC.CLAUDE_DEFAULT_PERMISSION_MODE, async (_e, cwd: string) => {
    const workspace = await workspaces.findByPath(cwd)
    const profile = await profiles.get(workspace?.profileId ?? DEFAULT_PROFILE_ID)
    return readDefaultMode(join(profile.configDir, 'settings.json'))
  })
  ipcMain.handle(IPC.CLAUDE_SAVE_DEFAULTS, (_e, patch: ModelDefaultsPatch) => saveModelDefaults(userSettingsFile(), patch))
  ipcMain.on(
    IPC.CLAUDE_SEND,
    (
      _e,
      paneId: string,
      content: UserContentBlock[],
      uuid: string
    ) => claudeManager.send(paneId, content, uuid)
  )

  ipcMain.handle(IPC.CLAUDE_LIST_LOCAL_SESSIONS, async (_e, cwd: string) =>
    listLocalSessions(await transcriptsDirForCwd(cwd))
  )
  ipcMain.handle(IPC.CLAUDE_SUBAGENT_TRANSCRIPT, async (_e, request: SubagentTranscriptRequest) =>
    readSubagentTranscript(await transcriptsDirForCwd(request.cwd), request.sessionId, { agentId: request.agentId, toolUseId: request.toolUseId })
  )
  ipcMain.handle(IPC.CLAUDE_RENAME_SESSION, async (_e, rename: SessionRename): Promise<RenameResult> => {
    const title = cleanSessionTitle(rename.title)
    if (!title) return { ok: false, error: 'title must be non-empty' }
    // A running CLI writes the transcript itself; appending beside it would race its writes.
    if (rename.paneId && claudeManager.isAlive(rename.paneId)) {
      const told = await claudeManager.control(rename.paneId, 'rename_session', { title, source: 'host', session_id: rename.sessionId })
      return told.ok ? { ok: true, title } : { ok: false, error: told.error }
    }
    const written = await appendCustomTitle(await transcriptsDirForCwd(rename.cwd), rename.sessionId, title)
    return written ? { ok: true, title } : { ok: false, error: 'no transcript to rename' }
  })

  ipcMain.handle(IPC.FILES_SAVE_AS, async (event, suggestedName: string, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return saveAsDialog(win, suggestedName, content)
  })

  ipcMain.handle(IPC.FILES_READ, (_e, cwd: string, relativePath: string) =>
    readProjectFile(cwd, relativePath)
  )
  ipcMain.handle(IPC.FILES_WRITE, (_e, cwd: string, relativePath: string, content: string) =>
    writeProjectFile(cwd, relativePath, content)
  )

  ipcMain.handle(IPC.GIT_STATUS, (_e, cwd: string) => getStatus(cwd))
  ipcMain.handle(
    IPC.GIT_DIFF,
    (_e, cwd: string, path: string, staged: boolean, untracked?: boolean) =>
      untracked ? getUntrackedFilePreview(cwd, path) : getDiff(cwd, path, staged)
  )
  ipcMain.on(IPC.CLAUDE_INTERRUPT, (_e, paneId: string) => claudeManager.interrupt(paneId))
  ipcMain.on(IPC.CLAUDE_STOP, (_e, paneId: string) => claudeManager.stop(paneId))

  unsubscribers.push(
    claudeManager.onEvent((paneId, event) => {
      const envelope = { paneId, profileId: claudeManager.profileOf(paneId), event }
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.CLAUDE_EVENT, envelope)
      }
    })
  )
  unsubscribers.push(
    claudeManager.onInit((paneId, init) => {
      const envelope: SessionInitEnvelope = { paneId, profileId: claudeManager.profileOf(paneId), init }
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.CLAUDE_INIT, envelope)
      }
    })
  )
  unsubscribers.push(
    claudeManager.onExit((paneId, exitCode) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.CLAUDE_EXIT, { paneId, exitCode })
      }
    })
  )

  claudeManager.setIncomingHandlerFactory((paneId) => approvalBroker.handlerFor(paneId))
  unsubscribers.push(
    approvalBroker.onRaised((request) => {
      sessionStatusTracker.apply(request.paneId, { kind: 'permission-raised', requestId: request.requestId })
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.APPROVAL_REQUEST, request)
      }
    }),
    approvalBroker.onSettled((settled) => {
      sessionStatusTracker.apply(settled.paneId, { kind: 'permission-resolved', requestId: settled.requestId })
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.APPROVAL_SETTLED, settled)
      }
    })
  )

  unsubscribers.push(
    claudeManager.onSpawn((paneId, cwd) => sessionStatusTracker.spawned(paneId, cwd)),
    claudeManager.onSend((paneId) => sessionStatusTracker.apply(paneId, { kind: 'user-message' })),
    claudeManager.onEvent((paneId, event) => sessionStatusTracker.apply(paneId, { kind: 'claude-event', event })),
    claudeManager.onExit((paneId) => sessionStatusTracker.apply(paneId, { kind: 'exit' })),
    sessionStatusTracker.onChange((entry) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.SESSION_STATUS_CHANGED, entry)
      }
    })
  )
  ipcMain.handle(IPC.SESSION_STATUS_LIST, () => sessionStatusTracker.list())
  ipcMain.on(IPC.SESSION_SCREEN_FOCUS, (_e, focus: ScreenFocus) => setScreenFocus(focus))

  ipcMain.handle(IPC.APPROVAL_LIST, () => approvalBroker.list())
  ipcMain.on(IPC.APPROVAL_RESPOND, (_e, requestId: string, reply: ApprovalReply) => {
    approvalBroker.respond(requestId, reply)
  })

  app.on('before-quit', () => {
    ptyManager.killAll()
    claudeManager.stopAll()
    claudeManager.setIncomingHandlerFactory(null)
    for (const u of unsubscribers) u()
    unsubscribers = []
  })
}
