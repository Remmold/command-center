import { ipcMain, dialog, BrowserWindow, app, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { IPC } from '../shared/ipc-channels'
import * as workspaces from './workspaces/store'
import * as profiles from './profiles/store'
import { createSidebarGroupsStore } from './sidebarGroups/store'
import { createChatHistoryStore } from './chatHistory/store'
import { pathKey } from '../shared/findings'
import { isHistoryChange } from '../shared/chatHistory'
import { liveConfigDir } from './observed/turn'
import * as vscodeMatch from './profiles/vscodeMatch'
import { transcriptsDirForCwd, transcriptsDirForWorkspace } from './profiles/transcripts'
import { ObservedService } from './observed/service'
import { observedRefreshMs } from '../shared/observedRefresh'
import * as apps from './apps/store'
import { appManager } from './apps/manager'
import { createPtyManager } from './pty/nodePty'
import { TerminalRegistry } from './pty/terminalRegistry'
import { claudeManager } from './claude/manager'
import { holdQuit } from './quitHold'
import { listProjectFiles } from './files/lister'
import { findMentions } from './files/mentions'
import { saveAsDialog } from './files/save'
import { readProjectFile, writeProjectFile } from './files/io'
import { openWithSystem, readImage, resolveLink } from './files/links'
import { resolveMedia, revealInFolder } from './files/media'
import { registerTestFlowIpc } from './testFlow/service'
import { registerDriftChecksIpc } from './driftChecks/service'
import { registerVideoIpc } from './video/service'
import { appendCustomTitle, cleanSessionTitle, listLocalSessions } from './claude/local-sessions'
import { SubagentWatchService } from './claude/subagentWatch'
import { isTeleportedSession } from './claude/teleport'
import { BoardService } from './board/service'
import { DiscoveryService } from './board/discoveryService'
import { contextReport, readListedFile, startTotals, writeListedFile } from './context/service'
import { addWorktree, branchTaken, getDiff, getStatus, getUntrackedFilePreview, isGitRepo, mainBranch, removeNewWorktree } from './git/service'
import { createFeatureStore } from './features/store'
import { featureAccount } from './features/account'
import { killRunningInstalls, runInstall } from './features/install'
import { createPortReserver, portAccepts, portIsFree } from './features/ports'
import { createServerRunner } from './features/serverRunner'
import { closeFeaturePair, openPair } from './features/pairWindows'
import { commitsBeyond, completeFeature, removeFeatureWorktree, removeWorktreeOnly, reopenFeature } from './features/complete'
import { testFeature } from './features/testPair'
import { featureChecklistPath, repoNameFor } from '../shared/testFlow'
import { sourceCandidates } from './features/source'
import { createPreviewConfigStore } from './previewConfig/store'
import { beginPreviewDraft, discardPreviewDraft, readPreviewDraftFile, sweepStalePreviewDrafts } from './previewConfig/draftFile'
import { createStageService, type StageService } from './features/stageService'
import { rateLimitOf, type DigestFeature } from './features/digest'
import { workspaceOptions } from '../shared/workspaceLabel'
import { createDigestWriter, type DigestWriter } from './features/digestWriter'
import { readTestFlowsFolder } from './testFlow/settings'
import { createFeature, discardFeature, preflightFeature, writeNewFile, type CreateDeps } from './features/create'
import type { FeatureRecord, NewFeatureRequest, PreflightRequest, PreflightResult } from '../shared/features'
import type { PreviewConfig } from '../shared/previewConfig'
import { approvalBroker } from './claude/approvals'
import { readDefaultMode, readModelDefaults, readPromptSuggestionsAllowed, saveModelDefaults } from './claude/userSettings'
import { MANAGED_SETTINGS_FILE, readOrganisationLayer, readSettingsFile, saveSettingsFile, settingsTargetProblem } from './claude/settingsFile'
import { SettingsFileWatch } from './claude/settingsWatch'
import { isSettingsObject, isSettingsPatch, type ClaudeSettingsRead, type SettingsLayer, type SettingsLayerFile } from '../shared/claudeSettings'
import type { ApprovalReply } from '../shared/approval'
import { sessionStatusTracker } from './sessions/tracker'
import { backgroundProcessTracker } from './sessions/backgroundProcesses'
import { portOpen } from './util/portOpen'
import { isLocalUrl } from '../shared/localPorts'
import { agentSweep } from './claude/agentSweepService'
import { UsageService } from './usage/service'
import { probeUsage } from './usage/probe'
import type { RateLimitInfo } from './usage/usageReply'
import { featureDigestFile, legacyFeatureDigestFile, mainChatDir, previewDraftsFolder, userDataPath } from './util/paths'
import { realPathFrom } from './features/realPath'
import { createMainChatStore } from './features/mainChatStore'
import { MAIN_CHAT_PANE_ID, mainChatLaunch, mainChatReply, type MainChatInfo } from '../shared/mainChat'
import { setScreenFocus } from './sessions/screenFocus'
import {
  DEFAULT_PROFILE_ID,
  DEFAULT_SHELL_KIND,
  type AddWorkspaceResult,
  type Workspace,
  type AdoptResult,
  type ClaudeStartOptions,
  type UserContentBlock,
  type ModelDefaultsPatch,
  type ScreenFocus,
  type SessionInitEnvelope,
  type SessionRename,
  type RenameResult,
  type CreateTerminalRequest
} from '../shared/types'
import type { RepoIdentityService } from './repoIdentity/service'
import type { StartWithWindowsControl } from './tray/startWithWindows'
import { onZoomChanged, stepZoom, zoomLevel } from './zoom/service'
import { isZoomStep } from '../shared/zoom'

let unsubscribers: Array<() => void> = []

/** The app's one terminal pool (ADR 0006). */
export const terminals = new TerminalRegistry(createPtyManager())

/** A stuck taskkill must never keep the app from quitting. */
const QUIT_KILL_LIMIT_MS = 3000

interface IpcDeps {
  repoIdentities: RepoIdentityService
  startWithWindows: StartWithWindowsControl
}

export function registerIpc({ repoIdentities, startWithWindows }: IpcDeps): void {
  let featureStages: StageService | undefined
  let featureDigest: DigestWriter | undefined
  const board = new BoardService(workspaces.list, (model) => {
    featureStages?.changed()
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
  ipcMain.handle(IPC.CONTEXT_REPORT, (_e, workspaceId: string) => contextReport(workspaceId))
  ipcMain.handle(IPC.CONTEXT_START_TOTALS, () => startTotals())
  ipcMain.handle(IPC.CONTEXT_READ_FILE, (_e, workspaceId: string, path: string) => readListedFile(workspaceId, path))
  ipcMain.handle(IPC.CONTEXT_WRITE_FILE, (_e, workspaceId: string, path: string, content: string) => writeListedFile(workspaceId, path, content))
  unsubscribers.push(registerDriftChecksIpc())
  unsubscribers.push(() => board.stop())
  unsubscribers.push(registerVideoIpc())

  const sendAll = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
  ipcMain.handle(IPC.START_WITH_WINDOWS_GET, () => startWithWindows.get())
  ipcMain.handle(IPC.START_WITH_WINDOWS_SET, (_e, checked: boolean) => startWithWindows.set(checked === true))
  startWithWindows.onChanged((state) => sendAll(IPC.START_WITH_WINDOWS_CHANGED, state))
  ipcMain.handle(IPC.ZOOM_GET, () => zoomLevel())
  ipcMain.handle(IPC.ZOOM_STEP, (_e, step: unknown) => (isZoomStep(step) ? stepZoom(step) : zoomLevel()))
  onZoomChanged((level) => sendAll(IPC.ZOOM_CHANGED, level))

  const observed = new ObservedService(
    workspaces.list,
    transcriptsDirForWorkspace,
    (sessions) => sendAll(IPC.OBSERVED_CHANGED, sessions),
    (event) => sendAll(IPC.OBSERVED_ITEMS, event),
    observedRefreshMs(process.env)
  )
  observed.start()
  ipcMain.handle(IPC.OBSERVED_LIST, () => observed.list())
  ipcMain.on(IPC.OBSERVED_SET_HOSTED, (_e, sessionIds: string[]) => observed.setHosted(sessionIds))
  ipcMain.handle(IPC.OBSERVED_OPEN, (_e, workspaceId: string, sessionId: string) =>
    observed.open(workspaceId, sessionId)
  )
  ipcMain.on(IPC.OBSERVED_CLOSE, () => observed.close())
  ipcMain.handle(IPC.OBSERVED_TURN, (_e, workspaceId: string, sessionId: string) => observed.turn(workspaceId, sessionId))
  ipcMain.handle(IPC.OBSERVED_READ, (_e, workspaceId: string, sessionId: string) => observed.items(workspaceId, sessionId))
  ipcMain.handle(IPC.OBSERVED_IMAGE, (_e, workspaceId: string, sessionId: string, uuid: string, block: number) =>
    observed.image(workspaceId, sessionId, uuid, block)
  )
  ipcMain.handle(IPC.OBSERVED_LIVE_CONFIG_DIR, async (_e, sessionId: string) =>
    /^[\w-]+$/.test(sessionId) ? liveConfigDir(await profiles.knownConfigDirs(), sessionId) : null
  )
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
    featureDigest?.changed()
    void repoIdentities.detectMissing()
    void refreshBoard()
    void observed.workspacesChanged()
    void discovery.rescan()
  }

  // The main chat's folder is a workspace record only so its sessions resolve an account and a transcript folder; no list shows it.
  const isMainChatFolder = (w: Workspace): boolean => resolve(w.path).toLowerCase() === resolve(mainChatDir()).toLowerCase()
  const listed = (all: Workspace[]): Workspace[] => all.filter((w) => !isMainChatFolder(w))
  ipcMain.handle(IPC.WORKSPACES_LIST, async () => listed(await workspaces.list()))

  ipcMain.handle(IPC.WORKSPACES_ADD_PATH, async (_e, path: unknown): Promise<AddWorkspaceResult> => {
    if (typeof path !== 'string' || path.trim() === '') return { ok: false, error: 'No folder given' }
    const folder = resolve(path.trim())
    const stat = await fs.stat(folder).catch(() => null)
    if (!stat) return { ok: false, error: `${folder} does not exist` }
    if (!stat.isDirectory()) return { ok: false, error: `${folder} is not a folder` }
    const workspace = await workspaces.add(folder, await vscodeMatch.profileForNewWorkspace(folder))
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
    const added = await workspaces.add(result.filePaths[0], await vscodeMatch.profileForNewWorkspace(result.filePaths[0]))
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

  ipcMain.handle(IPC.WORKSPACES_REORDER, async (_e, ids: unknown) =>
    listed(await workspaces.reorder(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []))
  )

  const mainChatStore = createMainChatStore(userDataPath('main-chat.json'))
  const mainChatInfo = async (): Promise<MainChatInfo> => {
    const path = mainChatDir()
    await fs.mkdir(path, { recursive: true })
    const saved = await mainChatStore.get()
    const profileId = saved.profileId && (await profiles.list()).some((p) => p.id === saved.profileId) ? saved.profileId : DEFAULT_PROFILE_ID
    let workspace = (await workspaces.list()).find(isMainChatFolder) ?? (await workspaces.add(path, profileId))
    if (workspace.profileId !== profileId) workspace = (await workspaces.setProfile(workspace.id, profileId)) ?? workspace
    return { workspaceId: workspace.id, path, profileId, claudeSessionId: saved.claudeSessionId, digestFile: featureDigestFile() }
  }
  ipcMain.handle(IPC.MAIN_CHAT_INFO, mainChatInfo)
  ipcMain.handle(IPC.MAIN_CHAT_SET_PROFILE, async (_e, profileId: unknown) => {
    const before = await mainChatInfo()
    if (typeof profileId === 'string' && profileId !== before.profileId && (await profiles.list()).some((p) => p.id === profileId)) await mainChatStore.setProfile(profileId)
    return mainChatInfo()
  })
  ipcMain.handle(IPC.MAIN_CHAT_SET_CLAUDE_SESSION, (_e, claudeSessionId: unknown) =>
    typeof claudeSessionId === 'string' && claudeSessionId !== '' ? mainChatStore.setClaudeSession(claudeSessionId) : undefined
  )

  const featureStore = createFeatureStore(userDataPath('features.json'))
  const previewConfigs = createPreviewConfigStore(userDataPath('preview-configs.json'))
  ipcMain.handle(IPC.PREVIEW_CONFIG_GET, (_e, workspaceId: unknown) => (typeof workspaceId === 'string' ? previewConfigs.get(workspaceId) : null))
  ipcMain.handle(IPC.PREVIEW_CONFIG_SAVE, (_e, workspaceId: unknown, raw: unknown) =>
    typeof workspaceId === 'string' ? previewConfigs.save(workspaceId, raw) : { ok: false, error: 'No workspace was named.' }
  )
  void fs.rm(legacyFeatureDigestFile(), { force: true })
  void sweepStalePreviewDrafts(previewDraftsFolder(), Date.now())
  ipcMain.handle(IPC.PREVIEW_DRAFT_BEGIN, () => beginPreviewDraft(previewDraftsFolder(), randomUUID()))
  ipcMain.handle(IPC.PREVIEW_DRAFT_READ, (_e, file: unknown) => readPreviewDraftFile(previewDraftsFolder(), file))
  ipcMain.handle(IPC.PREVIEW_DRAFT_DISCARD, (_e, file: unknown) => discardPreviewDraft(previewDraftsFolder(), file))
  const featureDeps: CreateDeps = {
    git: {
      isRepo: isGitRepo,
      mainBranch,
      branchTaken,
      addWorktree,
      removeNewWorktree
    },
    workspaces: {
      get: async (id) => (await workspaces.list()).find((w) => w.id === id),
      add: workspaces.add,
      remove: workspaces.remove
    },
    profile: async (profileId) => {
      const { env } = await profiles.prepareSession(profileId)
      return { ...(await profiles.get(profileId)), env }
    },
    features: featureStore,
    installCommand: async (workspaceId) => (await previewConfigs.get(workspaceId))?.install ?? '',
    hasPreviewBrowser: async (workspaceId) => ((await previewConfigs.get(workspaceId))?.servers.length ?? 0) > 0,
    runInstall,
    installing: (name, running) => sendAll(IPC.FEATURES_INSTALLING, { name, running }),
    pathExists: (path) => fs.access(path).then(() => true, () => false),
    writeNewFile,
    now: () => Date.now()
  }
  featureStages = createStageService({
    listFeatures: featureStore.list,
    listWorkspaces: workspaces.list,
    testFlowsFolder: readTestFlowsFolder,
    push: (stages) => {
      featureDigest?.changed()
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.FEATURES_STAGES_CHANGED, stages)
      }
    }
  })
  unsubscribers.push(() => featureStages?.stop())
  ipcMain.handle(IPC.FEATURES_LIST, () => featureStore.list())
  ipcMain.handle(IPC.FEATURES_STAGES, () => featureStages?.current() ?? {})
  ipcMain.handle(IPC.FEATURES_CREATE, async (_e, request: NewFeatureRequest) => {
    const result = await createFeature(featureDeps, request)
    if (result.ok) workspacesChanged()
    featureStages?.changed()
    return result
  })
  ipcMain.handle(IPC.FEATURES_PREFLIGHT, (_e, request: PreflightRequest): Promise<PreflightResult> => {
    const text = (v: unknown): v is string => typeof v === 'string'
    if (!request || !text(request.workspaceId) || !text(request.name) || !text(request.description) || (request.brief !== undefined && !text(request.brief))) {
      return Promise.resolve({ ok: false, error: 'The proposal could not be checked.' })
    }
    return preflightFeature(featureDeps, request)
  })
  const previewConfigFor = async (feature: FeatureRecord): Promise<PreviewConfig | null> => {
    for (const id of sourceCandidates(feature, await workspaces.list())) {
      const config = await previewConfigs.get(id)
      if (config) return config
    }
    return null
  }
  const accountOfFeatureWork = (workspaceId: string) =>
    featureAccount(
      {
        workspace: async (id) => (await workspaces.list()).find((w) => w.id === id),
        hasProfile: async (id) => (await profiles.list()).some((p) => p.id === id),
        prepare: profiles.prepareSession
      },
      workspaceId
    )
  const portReserver = createPortReserver({ list: featureStore.list, save: featureStore.setPorts, isFree: portIsFree })
  const serverRunner = createServerRunner({
    terminals,
    feature: async (name) => (await featureStore.list()).find((f) => f.name === name),
    config: previewConfigFor,
    env: (workspaceId) => accountOfFeatureWork(workspaceId),
    reservePorts: portReserver.reserve,
    isReady: (port) => portAccepts(port),
    shell: DEFAULT_SHELL_KIND
  })
  ipcMain.handle(IPC.FEATURES_TEST, (_e, name: unknown) =>
    typeof name === 'string'
      ? testFeature(
          {
            feature: async (n) => (await featureStore.list()).find((f) => f.name === n),
            config: previewConfigFor,
            runner: serverRunner,
            flowFocus: async (feature) => {
              const folder = await readTestFlowsFolder()
              const repoName = (await workspaces.list()).find((w) => w.id === feature.workspaceId)?.repoName ?? repoNameFor([], feature.worktreePath)
              const checklist = featureChecklistPath([feature], feature.worktreePath, folder, repoName)
              return { picks: checklist ? [{ path: checklist, source: 'repo' }] : [], folder, repoName, title: feature.name, ...(checklist ? { checklist } : {}) }
            },
            open: openPair
          },
          name
        )
      : { ok: false, error: 'No feature was named.' }
  )
  unsubscribers.push(serverRunner.onChanged((name, view) => sendAll(IPC.FEATURES_SERVERS_CHANGED, { name, view })))
  ipcMain.handle(IPC.FEATURES_SERVERS, () => serverRunner.all())
  ipcMain.handle(IPC.FEATURES_SERVERS_START, (_e, name: unknown) =>
    typeof name === 'string' ? serverRunner.start(name) : { ok: false, error: 'No feature was named.' }
  )
  ipcMain.handle(IPC.FEATURES_SERVERS_RETRY, (_e, name: unknown, server: unknown) =>
    typeof name === 'string' && typeof server === 'string' ? serverRunner.retry(name, server) : { ok: false, error: 'No server was named.' }
  )
  ipcMain.handle(IPC.FEATURES_SERVERS_STOP, (_e, name: unknown) => (typeof name === 'string' ? serverRunner.stop(name) : undefined))
  const featureNamed = async (n: string) => (await featureStore.list()).find((f) => f.name === n)
  ipcMain.handle(IPC.FEATURES_COMPLETE, async (_e, name: unknown) => {
    if (typeof name !== 'string') return { ok: false, error: 'No feature was named.' }
    const result = await serverRunner.lock.run(name, () =>
      completeFeature({ feature: featureNamed, runner: serverRunner, closePair: closeFeaturePair, setPorts: featureStore.setPorts, setCompleted: featureStore.setCompleted, now: () => Date.now() }, name)
    )
    featureStages?.changed()
    return result
  })
  ipcMain.handle(IPC.FEATURES_REOPEN, async (_e, name: unknown) => {
    if (typeof name !== 'string') return { ok: false, error: 'No feature was named.' }
    const result = await serverRunner.lock.run(name, () =>
      reopenFeature({ feature: featureNamed, config: previewConfigFor, reservePorts: portReserver.reserve, setPorts: featureStore.setPorts, setCompleted: featureStore.setCompleted }, name)
    )
    featureStages?.changed()
    return result
  })
  ipcMain.handle(IPC.FEATURES_REMOVE_WORKTREE, async (_e, name: unknown) => {
    if (typeof name !== 'string') return { ok: false, error: 'No feature was named.' }
    const result = await serverRunner.lock.run(name, () =>
      removeFeatureWorktree(
      {
        feature: featureNamed,
        repo: async (feature) => {
          const all = await workspaces.list()
          for (const id of sourceCandidates(feature, all)) {
            const path = all.find((w) => w.id === id)?.path
            const base = path ? await mainBranch(path) : null
            if (path && base) return { path, base }
          }
          return null
        },
        commitsBeyond,
        removeWorktree: removeWorktreeOnly,
        forget: async (feature) => {
          await featureStore.remove(feature.name)
          await workspaces.remove(feature.workspaceId).catch(() => undefined)
        }
      },
      name
      )
    )
    if (result.ok) workspacesChanged()
    featureStages?.changed()
    return result
  })
  ipcMain.handle(IPC.FEATURES_SET_CLAUDE_SESSION, (_e, name: unknown, claudeSessionId: unknown) =>
    typeof name === 'string' && typeof claudeSessionId === 'string' ? featureStore.setClaudeSessionId(name, claudeSessionId) : undefined
  )
  ipcMain.handle(IPC.FEATURES_DISCARD, async (_e, name: string, workspaceId: string) => {
    const source = (await workspaces.list()).find((w) => w.id === workspaceId)
    if (source) await discardFeature(featureDeps, name, source.path)
    workspacesChanged()
    featureStages?.changed()
  })

  const sidebarGroups = createSidebarGroupsStore(app.getPath('userData'))
  ipcMain.handle(IPC.SIDEBAR_GROUPS_LOAD, () => sidebarGroups.load())
  ipcMain.handle(IPC.SIDEBAR_GROUPS_SAVE, (_e, layout: unknown) => sidebarGroups.save(layout))

  const chatHistory = createChatHistoryStore(join(app.getPath('userData'), 'chat-history'))
  ipcMain.on(IPC.CHAT_HISTORY_LOAD, (e) => {
    chatHistory.load().then(
      (items) => (e.returnValue = items),
      (err) => {
        console.error('could not read the chat history', err)
        e.returnValue = {}
      }
    )
  })
  ipcMain.handle(IPC.CHAT_HISTORY_IMPORT_LEGACY, (_e, entry: unknown) => {
    if (typeof entry !== 'string') throw new Error('the legacy chat history is not text')
    return chatHistory.importLegacy(entry)
  })
  ipcMain.on(IPC.CHAT_HISTORY_APPLY, (_e, paneId: unknown, changes: unknown) => {
    if (typeof paneId !== 'string' || paneId === '' || !Array.isArray(changes)) return
    chatHistory.apply(paneId, changes.filter(isHistoryChange)).catch((err) => console.error(`could not save the chat history of ${paneId}`, err))
  })

  ipcMain.handle(IPC.REPO_IDENTITIES_LIST, () => repoIdentities.list())
  ipcMain.handle(IPC.REPO_IDENTITIES_SET_NAME, async (_e, key: string, name: string) => {
    const views = await repoIdentities.setDisplayName(key, name)
    featureDigest?.changed()
    return views
  })
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
  ipcMain.handle(IPC.REPO_IDENTITIES_DETECT, (_e, key: string) => repoIdentities.detectAgain(key))
  ipcMain.on(IPC.REPO_IDENTITIES_SET_RENDERED, (_e, key: string, dataUrl: string) => {
    repoIdentities.setRendered(key, dataUrl).catch((err) => console.error('[repo icons] could not keep drawn icon', err))
  })

  ipcMain.handle(IPC.PROFILES_LIST, () => profiles.list())
  ipcMain.handle(IPC.PROFILES_CREATE, (_e, name: string) => profiles.create(name))
  ipcMain.handle(IPC.PROFILES_RENAME, async (_e, id: string, name: string) => {
    const renamed = await profiles.rename(id, name)
    featureDigest?.changed()
    return renamed
  })
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
  const stringList = (ids: unknown): string[] => (Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  ipcMain.handle(IPC.VSCODE_MATCH_GET, () => vscodeMatch.current())
  ipcMain.handle(IPC.VSCODE_MATCH_DISMISS, (_e, keys: unknown) => vscodeMatch.dismiss(stringList(keys)))
  ipcMain.handle(IPC.VSCODE_MATCH_DISMISS_NOTICE, () => vscodeMatch.dismissNotice())
  ipcMain.handle(IPC.VSCODE_MATCH_APPLY, async (_e, ids: unknown) => {
    const result = await vscodeMatch.useVsCodeAccounts(stringList(ids))
    usage.refresh()
    void observed.workspacesChanged()
    return result
  })
  ipcMain.handle(IPC.PROFILES_REMOVE, async (_e, id: string) => {
    const removed = await profiles.remove(id)
    if (removed) usage.refresh()
    featureDigest?.changed()
    return removed
  })

  const usage = new UsageService({
    listProfiles: profiles.list,
    envFor: async (profileId) => (await profiles.prepareSession(profileId)).env,
    probe: probeUsage,
    probeDir: userDataPath('usage-probe'),
    onChange: (all) => {
      featureDigest?.changed()
      sendAll(IPC.USAGE_CHANGED, all)
    }
  })
  usage.start()
  featureDigest = createDigestWriter({
    file: featureDigestFile(),
    workspaceLabels: async () => workspaceOptions(listed(await workspaces.list()), await repoIdentities.list()).map((o) => o.label),
    features: async (): Promise<DigestFeature[]> => {
      const [features, allWorkspaces, allProfiles, stages] = await Promise.all([featureStore.list(), workspaces.list(), profiles.list(), featureStages?.snapshot() ?? {}])
      const servers = serverRunner.all()
      const statuses = sessionStatusTracker.list()
      const limits = usage.list()
      const now = Date.now()
      return features.map((f) => {
        const workspace = allWorkspaces.find((w) => w.id === f.workspaceId)
        return {
          name: f.name,
          workspaceName: workspace?.name ?? null,
          worktreePath: f.worktreePath,
          completedAt: f.completedAt,
          accountName: (workspace && allProfiles.find((p) => p.id === workspace.profileId)?.name) ?? null,
          status: statuses.find((s) => s.paneId === f.sessionId)?.status ?? 'idle',
          stage: stages[f.name],
          servers: servers[f.name]?.servers ?? [],
          rateLimit: workspace ? rateLimitOf(limits.find((u) => u.profileId === workspace.profileId), now) : null
        }
      })
    }
  })
  unsubscribers.push(serverRunner.onChanged(() => featureDigest?.changed()), () => featureDigest?.stop())
  featureDigest.changed()
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

  // Terminals: one pool in main; the Shell drawer and the Processes view attach (ADR 0006)
  ipcMain.handle(IPC.TERMINALS_LIST, () => terminals.list())
  ipcMain.handle(IPC.TERMINALS_CREATE, (_e, request: CreateTerminalRequest) => terminals.create(request))
  ipcMain.handle(IPC.TERMINALS_ATTACH, (_e, id: string) => terminals.attach(id))
  ipcMain.on(IPC.TERMINALS_WRITE, (_e, id: string, data: string) => terminals.write(id, data))
  ipcMain.on(IPC.TERMINALS_RESIZE, (_e, id: string, cols: number, rows: number) => terminals.resize(id, cols, rows))
  ipcMain.on(IPC.TERMINALS_RENAME, (_e, id: string, label: string) => terminals.rename(id, label))
  ipcMain.handle(IPC.TERMINALS_RESTART, (_e, id: string) => terminals.restart(id))
  ipcMain.handle(IPC.TERMINALS_STOP, (_e, id: string) => terminals.stop(id))
  ipcMain.on(IPC.TERMINALS_CLOSE, (_e, id: string) => void terminals.close(id))

  unsubscribers.push(
    terminals.onData((id, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.TERMINALS_DATA, { id, data })
      }
    })
  )
  unsubscribers.push(
    terminals.onChanged((list) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.TERMINALS_CHANGED, list)
      }
    })
  )

  // Claude (stream-json subprocess)
  ipcMain.handle(IPC.CLAUDE_START, async (_e, options: ClaudeStartOptions) => {
    if (options.paneId === MAIN_CHAT_PANE_ID) return startMainChat(options)
    const workspace = await workspaces.findByPath(options.cwd)
    const ofFeature = (await featureStore.list()).find((f) => pathKey(f.worktreePath) === pathKey(options.cwd))
    if (ofFeature) {
      const account = await accountOfFeatureWork(ofFeature.workspaceId)
      if (!account.ok) return { ok: false as const, error: account.error }
    }
    if (!workspace) console.warn('[profiles] no workspace at', options.cwd, '- session runs on Default')
    const { profileId, env } = await profiles.prepareSession(workspace?.profileId ?? DEFAULT_PROFILE_ID)
    const teleported = options.resumeSessionId ? await isTeleportedSession(await transcriptsDirForCwd(options.cwd), options.resumeSessionId) : false
    const allowed = await readPromptSuggestionsAllowed(join((await profiles.get(profileId)).configDir, 'settings.json'))
    const promptSuggestions = options.promptSuggestions !== false && allowed
    const started = claudeManager.start({ ...options, promptSuggestions, profileEnv: env, profileId, teleported })
    return started.ok ? { ...started, profileId: claudeManager.profileOf(options.paneId) } : started
  })
  // Read-only by construction: the process is given read tools only, and the app answers its permission requests itself.
  const mainChatRoots = async (): Promise<string[]> => [dirname(featureDigestFile()), mainChatDir(), ...(await featureStore.list()).map((f) => f.worktreePath)]
  const startMainChat = async (options: ClaudeStartOptions) => {
    const info = await mainChatInfo()
    const { env } = await profiles.prepareSession(info.profileId)
    const launch = mainChatLaunch(featureDigestFile(), (await featureStore.list()).map((f) => f.worktreePath))
    const started = claudeManager.start({
      ...options,
      cwd: info.path,
      addDirs: launch.addDirs,
      permissionMode: 'default',
      allowBypass: false,
      extraArgs: launch.cliArgs,
      promptSuggestions: false,
      profileEnv: env,
      profileId: info.profileId
    })
    return started.ok ? { ...started, profileId: info.profileId } : started
  }
  ipcMain.handle(IPC.CLAUDE_PROCESS_PROFILE, (_e, paneId: string) => (claudeManager.isAlive(paneId) ? claudeManager.profileOf(paneId) : null))
  ipcMain.handle(
    IPC.CLAUDE_CONTROL,
    (_e, paneId: string, subtype: string, fields?: Record<string, unknown>) =>
      claudeManager.control(paneId, subtype, fields)
  )
  ipcMain.handle(IPC.CLAUDE_GET_INIT, (_e, paneId: string) => claudeManager.initOf(paneId))
  // App-made profiles hard-link Default's settings.json; an adopted folder keeps its own and is never written to.
  const userSettingsFile = (): string => join(profiles.defaultConfigDir(), 'settings.json')
  ipcMain.handle(IPC.CLAUDE_READ_DEFAULTS, async (_e, profileId: string) => {
    const profile = await profiles.get(profileId)
    return readModelDefaults(join(profile.configDir, 'settings.json'))
  })
  ipcMain.handle(IPC.CLAUDE_DEFAULT_PERMISSION_MODE, async (_e, cwd: string) => {
    const workspace = await workspaces.findByPath(cwd)
    const profile = await profiles.get(workspace?.profileId ?? DEFAULT_PROFILE_ID)
    return readDefaultMode(join(profile.configDir, 'settings.json'))
  })
  ipcMain.handle(IPC.CLAUDE_SAVE_DEFAULTS, (_e, patch: ModelDefaultsPatch) => saveModelDefaults(userSettingsFile(), patch))
  const layerFile = async (layer: SettingsLayer, path: string): Promise<SettingsLayerFile> => ({ layer, path, snapshot: await readSettingsFile(path) })
  const settingsWatch = new SettingsFileWatch((change) => sendAll(IPC.CLAUDE_SETTINGS_CHANGED, change))
  unsubscribers.push(() => settingsWatch.clear())
  // A read that finishes after a newer read or an unwatch must not watch its files.
  let watchTurn = 0
  ipcMain.handle(IPC.CLAUDE_SETTINGS_READ, async (_e, profileId: string, workspaceId: string | null): Promise<ClaudeSettingsRead> => {
    const turn = ++watchTurn
    const profile = await profiles.get(profileId)
    const workspace = workspaceId ? (await workspaces.list()).find((w) => w.id === workspaceId) : undefined
    const remoteFile = join(profile.configDir, 'remote-settings.json')
    const [account, keybindings, repo, local, organisation, ...organisationFiles] = await Promise.all([
      layerFile('account', join(profile.configDir, 'settings.json')),
      layerFile('account', join(profile.configDir, 'keybindings.json')),
      workspace ? layerFile('repo', join(workspace.path, '.claude', 'settings.json')) : null,
      workspace ? layerFile('local', join(workspace.path, '.claude', 'settings.local.json')) : null,
      readOrganisationLayer(remoteFile, MANAGED_SETTINGS_FILE),
      ...[remoteFile, MANAGED_SETTINGS_FILE].map(async (path) => ({ path, snapshot: await readSettingsFile(path) }))
    ])
    if (turn === watchTurn) settingsWatch.set([account, keybindings, repo, local, ...organisationFiles].filter((file) => file !== null))
    return { account: { ...account, profileId: profile.id }, keybindings, repo, local, organisation }
  })
  ipcMain.on(IPC.CLAUDE_SETTINGS_UNWATCH, () => {
    watchTurn++
    settingsWatch.clear()
  })
  ipcMain.handle(IPC.CLAUDE_SETTINGS_SAVE, async (_e, path: unknown, base: unknown, patch: unknown) => {
    if (typeof path !== 'string' || !isSettingsObject(base) || !isSettingsPatch(patch)) return { ok: false, error: 'malformed save' }
    const problem = await settingsTargetProblem(path, {
      configDirs: (await profiles.list()).map((p) => p.configDir),
      workspacePaths: (await workspaces.list()).map((w) => w.path)
    })
    if (problem) return { ok: false, error: problem }
    const saved = await saveSettingsFile(path, base, patch)
    if (saved.ok) settingsWatch.saved({ path, snapshot: saved.snapshot })
    return saved
  })
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
  const subagents = new SubagentWatchService(transcriptsDirForCwd, (event) => sendAll(IPC.SUBAGENTS_ITEMS, event))
  ipcMain.on(IPC.SUBAGENTS_WATCH, (_e, source: unknown) => void subagents.watch(source))
  ipcMain.on(IPC.SUBAGENTS_UNWATCH, (_e, source: unknown) => subagents.unwatch(source))
  ipcMain.on(IPC.SUBAGENTS_OPEN, (_e, target: unknown) => subagents.open(target))
  ipcMain.on(IPC.SUBAGENTS_CLOSE, (_e, target: unknown) => subagents.close(target))
  unsubscribers.push(() => subagents.stopAll())
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
  ipcMain.handle(IPC.FILES_RESOLVE_LINK, (_e, cwd: string, path: string) => resolveLink(cwd, path))
  ipcMain.handle(IPC.FILES_READ_IMAGE, (_e, path: string) => readImage(path))
  ipcMain.handle(IPC.FILES_OPEN_WITH_SYSTEM, (_e, path: string) => openWithSystem(path))
  ipcMain.handle(IPC.MEDIA_RESOLVE, (_e, cwd: string, paths: string[]) => resolveMedia(cwd, paths))
  ipcMain.handle(IPC.MEDIA_REVEAL, (_e, path: string) => revealInFolder(path))
  unsubscribers.push(registerTestFlowIpc())

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

  claudeManager.setIncomingHandlerFactory((paneId) => {
    if (paneId !== MAIN_CHAT_PANE_ID) return approvalBroker.handlerFor(paneId)
    return async (raw) => {
      if (raw.subtype !== 'can_use_tool') throw new Error(`Unsupported control request: ${raw.subtype}`)
      const input = typeof raw.input === 'object' && raw.input !== null ? (raw.input as Record<string, unknown>) : {}
      return { ...(await mainChatReply(typeof raw.tool_name === 'string' ? raw.tool_name : '', input, await mainChatRoots(), realPathFrom(mainChatDir()))), toolUseID: raw.tool_use_id }
    }
  })
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
    claudeManager.onSpawn((paneId, cwd) => agentSweep.spawned(paneId, cwd)),
    claudeManager.onEvent((paneId, event) => agentSweep.event(paneId, event)),
    claudeManager.onExit((paneId) => agentSweep.exited(paneId)),
    agentSweep.onEnded((paneId, taskId) => sessionStatusTracker.apply(paneId, { kind: 'agent-ended', taskId })),
    claudeManager.onSpawn((paneId) => backgroundProcessTracker.spawned(paneId)),
    claudeManager.onEvent((paneId, event) => backgroundProcessTracker.event(paneId, event)),
    claudeManager.onExit((paneId) => backgroundProcessTracker.exited(paneId)),
    backgroundProcessTracker.onChange((entry) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.BACKGROUND_PROCESSES_CHANGED, entry)
      }
    }),
    () => agentSweep.stop(),
    sessionStatusTracker.onChange((entry) => {
      featureDigest?.changed()
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.SESSION_STATUS_CHANGED, entry)
      }
    })
  )
  agentSweep.start()
  ipcMain.handle(IPC.SESSION_STATUS_LIST, () => sessionStatusTracker.list())
  ipcMain.handle(IPC.BACKGROUND_PROCESSES_LIST, () => backgroundProcessTracker.list())
  ipcMain.handle(IPC.BACKGROUND_PROCESSES_PORT_OPEN, (_e, port: number) => Number.isInteger(port) && port >= 1 && port <= 65535 && portOpen(port))
  ipcMain.handle(IPC.BACKGROUND_PROCESSES_OPEN_IN_BROWSER, async (_e, url: string): Promise<string | null> => {
    if (typeof url !== 'string' || !isLocalUrl(url)) return 'Not a local address'
    try {
      await shell.openExternal(url)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  })
  ipcMain.on(IPC.SESSION_SCREEN_FOCUS, (_e, focus: ScreenFocus) => setScreenFocus(focus))

  ipcMain.handle(IPC.APPROVAL_LIST, () => approvalBroker.list())
  ipcMain.on(IPC.APPROVAL_RESPOND, (_e, requestId: string, reply: ApprovalReply) => {
    approvalBroker.respond(requestId, reply)
  })

  holdQuit(
    app,
    () => {
      killRunningInstalls()
      const terminalsClosed = terminals.closeAll()
      const killed = claudeManager.stopAll()
      claudeManager.setIncomingHandlerFactory(null)
      for (const u of unsubscribers) u()
      unsubscribers = []
      return Promise.all([terminalsClosed, killed]).then(() => undefined)
    },
    QUIT_KILL_LIMIT_MS
  )
}
