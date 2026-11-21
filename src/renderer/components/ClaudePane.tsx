import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  Download,
  History,
  MessageCirclePlus,
  MoreHorizontal,
  PieChart,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  type LucideIcon
} from 'lucide-react'
import { ChatView } from './chat/ChatView'
import { PastSessionsModal } from './PastSessionsModal'
import { useProjectViewsStore, PERMISSION_MODES } from '../state/projectViewsStore'
import { useChatItemsStore } from '../state/chatItemsStore'
import { itemsToMarkdown } from './chat/exportMarkdown'
import { StatusDot } from './ui/StatusDot'
import { usePaneStatus } from '../state/sessionStatusStore'
import type {
  ClaudeChatSession,
  ClaudeModel,
  PermissionMode,
  ProjectView
} from '../state/projectViewsStore'

interface Props {
  view: ProjectView
  registerFocus?: (fn: () => void) => void
}

const MODEL_OPTIONS: ClaudeModel[] = ['sonnet', 'opus', 'haiku']

const PERMISSION_LABEL: Record<PermissionMode, string> = {
  ask: 'ask (popup)',
  acceptEdits: 'accept edits',
  bypassPermissions: 'bypass (yolo)',
  plan: 'plan (read-only)'
}

const PERMISSION_HINT: Record<PermissionMode, string> = {
  ask: 'shows an inline approval popup for every tool call',
  acceptEdits: 'auto-approves file edits, popup for everything else (bash, web, etc.)',
  bypassPermissions: 'no prompts — use only in trusted dirs',
  plan: 'no tool execution at all — research only'
}

const PERMISSION_ICON: Record<
  PermissionMode,
  { Icon: typeof Shield; color: string }
> = {
  ask: { Icon: ShieldAlert, color: 'text-blue-400' },
  acceptEdits: { Icon: ShieldCheck, color: 'text-emerald-400' },
  bypassPermissions: { Icon: ShieldOff, color: 'text-amber-400' },
  plan: { Icon: Shield, color: 'text-sky-400' }
}

const MODEL_COLOR: Record<string, string> = {
  sonnet: 'bg-emerald-500/15 text-emerald-300',
  opus: 'bg-amber-500/15 text-amber-300',
  haiku: 'bg-blue-500/15 text-blue-300'
}

interface MenuItemProps {
  icon: LucideIcon
  label: string
  description?: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

function MenuItem({ icon: Icon, label, description, onClick, danger, disabled }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        'flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' +
        (danger
          ? 'text-fg hover:bg-red-950/40 hover:text-red-300'
          : 'text-fg hover:bg-list-hover')
      }
    >
      <Icon
        size={14}
        strokeWidth={1.75}
        className={`mt-0.5 shrink-0 ${danger ? 'text-red-400' : 'text-muted'}`}
      />
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {description && (
          <div className="text-[10px] text-muted">{description}</div>
        )}
      </div>
    </button>
  )
}

export function ClaudePane({ view, registerFocus }: Props) {
  const addClaudeSession = useProjectViewsStore((s) => s.addClaudeSession)
  const closeClaudeSession = useProjectViewsStore((s) => s.closeClaudeSession)
  const setActiveClaudeSession = useProjectViewsStore((s) => s.setActiveClaudeSession)
  const clearClaudeSessionId = useProjectViewsStore((s) => s.clearClaudeSessionId)
  const setSessionPermissionMode = useProjectViewsStore((s) => s.setSessionPermissionMode)
  const setSessionLabel = useProjectViewsStore((s) => s.setSessionLabel)
  const duplicateSession = useProjectViewsStore((s) => s.duplicateSession)
  const loadSessionFromLocal = useProjectViewsStore((s) => s.loadSessionFromLocal)
  const defaultModel = useProjectViewsStore((s) => s.defaultModel)
  const setDefaultModel = useProjectViewsStore((s) => s.setDefaultModel)
  const clearItems = useChatItemsStore((s) => s.clearItems)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [permPickerOpen, setPermPickerOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pastModalOpen, setPastModalOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)

  // Close more menu on outside click
  useEffect(() => {
    if (!moreMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!moreMenuRef.current?.contains(e.target as Node)) setMoreMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [moreMenuOpen])

  const handleNewChat = (model: ClaudeModel) => {
    addClaudeSession(view.projectId, { model })
    setPickerOpen(false)
  }

  const handleClearActive = () => {
    setMoreMenuOpen(false)
    if (!view.activeClaudeSessionId) return
    const ok = confirm(
      'Clear this chat? Items and the claude session id will be wiped (process restarts fresh on next send).'
    )
    if (!ok) return
    window.api.claude.stop(view.activeClaudeSessionId)
    clearItems(view.activeClaudeSessionId)
    clearClaudeSessionId(view.activeClaudeSessionId)
  }

  const handleChangePermission = (mode: PermissionMode) => {
    const activeId = view.activeClaudeSessionId
    if (!activeId) return
    setSessionPermissionMode(activeId, mode)
    window.api.claude.stop(activeId)
    setPermPickerOpen(false)
  }

  const startRename = (sess: ClaudeChatSession) => {
    setRenamingId(sess.id)
    setRenameValue(sess.label)
  }

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      setSessionLabel(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }

  const handleDuplicate = () => {
    setMoreMenuOpen(false)
    if (view.activeClaudeSessionId) {
      duplicateSession(view.projectId, view.activeClaudeSessionId)
    }
  }

  const handleExport = async () => {
    setMoreMenuOpen(false)
    if (!view.activeClaudeSessionId) return
    const items = useChatItemsStore.getState().items[view.activeClaudeSessionId] ?? []
    if (items.length === 0) {
      alert('nothing to export — this chat has no items yet.')
      return
    }
    const session = view.claudeSessions.find((s) => s.id === view.activeClaudeSessionId)
    const title = `${view.projectName} — ${session?.label ?? 'chat'}`
    const md = itemsToMarkdown(items, title)
    const safeName = title.replace(/[^\w.-]+/g, '_')
    await window.api.files.saveAs(`${safeName}.md`, md)
  }

  const handleOpenHistory = () => {
    setMoreMenuOpen(false)
    setPastModalOpen(true)
  }

  const handleUsageHint = () => {
    setMoreMenuOpen(false)
    alert('Type /usage in the input and press Enter to see your subscription usage breakdown.')
  }

  const activeSession = view.claudeSessions.find((s) => s.id === view.activeClaudeSessionId)
  const permIcon = activeSession ? PERMISSION_ICON[activeSession.permissionMode] : null

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      {pastModalOpen && (
        <PastSessionsModal
          cwd={view.projectPath}
          onClose={() => setPastModalOpen(false)}
          onLoad={(info) =>
            loadSessionFromLocal(
              view.projectId,
              info.sessionId,
              `loaded ${info.sessionId.slice(0, 6)}`
            )
          }
        />
      )}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-subtle bg-editor px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-fg">
            {view.projectName}
          </div>
          <div className="truncate text-[10px] text-muted">{view.projectPath}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {activeSession && permIcon && (
            <div className="relative">
              <button
                onClick={() => setPermPickerOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-md border border-subtle bg-sidebar/60 px-2.5 py-1 text-[11px] text-fg hover:border-strong hover:bg-list-hover"
                title={PERMISSION_HINT[activeSession.permissionMode]}
              >
                <permIcon.Icon size={13} strokeWidth={2} className={permIcon.color} />
                <span>{PERMISSION_LABEL[activeSession.permissionMode]}</span>
              </button>
              {permPickerOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-subtle bg-widget shadow-xl"
                  onMouseLeave={() => setPermPickerOpen(false)}
                >
                  <div className="border-b border-subtle px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    permission mode
                  </div>
                  {PERMISSION_MODES.map((m) => {
                    const mi = PERMISSION_ICON[m]
                    const isActive = m === activeSession.permissionMode
                    return (
                      <button
                        key={m}
                        onClick={() => handleChangePermission(m)}
                        className={
                          'flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs hover:bg-list-hover ' +
                          (isActive ? 'bg-sidebar/60 text-fg' : 'text-fg')
                        }
                      >
                        <mi.Icon size={14} strokeWidth={2} className={`mt-0.5 shrink-0 ${mi.color}`} />
                        <div className="min-w-0">
                          <div className="font-medium">{PERMISSION_LABEL[m]}</div>
                          <div className="text-[10px] text-muted">{PERMISSION_HINT[m]}</div>
                        </div>
                        {isActive && (
                          <span className="ml-auto text-[10px] text-muted">active</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setMoreMenuOpen((o) => !o)}
              className="rounded-md border border-subtle bg-sidebar/60 p-1.5 text-fg hover:border-strong hover:bg-list-hover"
              title="more actions"
            >
              <MoreHorizontal size={14} strokeWidth={2} />
            </button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-subtle bg-widget shadow-xl">
                <div className="border-b border-subtle px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  this chat
                </div>
                <MenuItem
                  icon={History}
                  label="load past session…"
                  description="resume any previous claude session in this folder"
                  onClick={handleOpenHistory}
                />
                <MenuItem
                  icon={Copy}
                  label="duplicate chat"
                  description="copy model + perms, fresh history"
                  onClick={handleDuplicate}
                  disabled={!activeSession}
                />
                <MenuItem
                  icon={Download}
                  label="export to markdown…"
                  description="save the conversation as .md"
                  onClick={handleExport}
                  disabled={!activeSession}
                />
                <MenuItem
                  icon={PieChart}
                  label="show /usage"
                  description="how to view subscription usage"
                  onClick={handleUsageHint}
                  disabled={!activeSession}
                />
                <div className="border-t border-subtle" />
                <MenuItem
                  icon={Trash2}
                  label="clear chat"
                  description="wipe items + session id (process restarts fresh)"
                  onClick={handleClearActive}
                  disabled={!activeSession}
                  danger
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex shrink-0 items-center border-b border-subtle bg-sidebar">
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
          {view.claudeSessions.length === 0 && (
            <span className="px-3 py-1.5 text-xs text-muted">no chats</span>
          )}
          {view.claudeSessions.map((sess) => {
            const active = sess.id === view.activeClaudeSessionId
            const renaming = sess.id === renamingId
            return (
              <div
                key={sess.id}
                className={
                  'group flex items-center gap-1.5 border-r border-subtle px-3 py-1.5 text-xs ' +
                  (active ? 'bg-editor text-fg' : 'text-muted hover:bg-list-hover')
                }
              >
                <PaneStatusDot paneId={sess.id} />
                {renaming ? (
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') {
                        setRenamingId(null)
                        setRenameValue('')
                      }
                    }}
                    className="w-24 rounded bg-list-selected px-1 text-xs text-fg focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setActiveClaudeSession(view.projectId, sess.id)}
                    onDoubleClick={() => startRename(sess)}
                    className="truncate"
                    title="double-click to rename"
                  >
                    {sess.label}
                  </button>
                )}
                <span
                  className={
                    'rounded px-1.5 py-0.5 text-[10px] ' +
                    (MODEL_COLOR[sess.model] ?? 'bg-list-selected text-muted')
                  }
                >
                  {sess.model}
                </span>
                {sess.claudeSessionId && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
                    title="resumable session"
                  />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeClaudeSession(view.projectId, sess.id)
                  }}
                  className="rounded px-0.5 text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
                  aria-label={`close ${sess.label}`}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
        <div className="relative">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            className="flex items-center gap-1.5 border-l border-subtle px-3 py-1.5 text-xs text-muted hover:bg-list-hover hover:text-fg"
            aria-label="new chat"
            title={`new chat with ${defaultModel}`}
          >
            <MessageCirclePlus size={13} strokeWidth={2} />
            <span>new chat</span>
            <span
              className={
                'rounded px-1.5 py-0.5 text-[10px] ' +
                (MODEL_COLOR[defaultModel] ?? 'bg-list-selected text-muted')
              }
            >
              {defaultModel}
            </span>
          </button>
          {pickerOpen && (
            <div
              className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-subtle bg-widget shadow-xl"
              onMouseLeave={() => setPickerOpen(false)}
            >
              {MODEL_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setDefaultModel(m)
                    handleNewChat(m)
                  }}
                  className={
                    'flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-list-hover ' +
                    (m === defaultModel ? 'text-fg' : 'text-muted')
                  }
                >
                  <span>{m}</span>
                  {m === 'sonnet' && <span className="text-[10px] text-emerald-400">cheap</span>}
                  {m === 'opus' && <span className="text-[10px] text-amber-400">$$$</span>}
                  {m === 'haiku' && (
                    <span className="text-[10px] text-emerald-400">cheapest</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-editor">
        {view.claudeSessions.map((sess) => {
          const active = sess.id === view.activeClaudeSessionId
          return (
            <div
              key={sess.id}
              className={'absolute inset-0 ' + (active ? '' : 'invisible')}
              aria-hidden={!active}
            >
              <ChatView
                paneId={sess.id}
                cwd={view.projectPath}
                model={sess.model}
                resumeSessionId={sess.claudeSessionId}
                permissionMode={sess.permissionMode}
                registerFocus={active ? registerFocus : undefined}
              />
            </div>
          )
        })}
        {view.claudeSessions.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-faint">
            click + new chat to start
          </div>
        )}
      </div>
    </section>
  )
}

function PaneStatusDot({ paneId }: { paneId: string }) {
  return <StatusDot status={usePaneStatus(paneId)} />
}
