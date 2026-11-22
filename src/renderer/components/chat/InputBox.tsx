import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, FileText, Paperclip, Square, X } from 'lucide-react'
import { SlashMenu } from './SlashMenu'
import { MentionMenu } from './MentionMenu'
import { FileChip, FileChipRow } from '../ui/FileChip'
import { IconButton } from '../ui/IconButton'
import { NoticeLine } from '../ui/NoticeLine'
import { insertMention, mentionText, mentionTrigger, unmentionableNotice, type MentionTrigger } from './mentions'
import { attachmentKind, overLimitBy, overLimitNotice, unsupportedNotice, type PromptAttachment } from './attachments'
import {
  argumentHint,
  buildMenu,
  initialActive,
  menuSections,
  moveActive,
  selectCommand,
  slashTrigger,
  type LocalAction,
  type MenuCommand,
  type OpenTarget,
  type SlashTrigger
} from './slashMenuModel'
import { MessageColumn } from './MessageColumn'
import { NO_RECALL, stepHistory, type HistoryCursor } from './promptHistory'
import { useGeneralSettingsStore } from '../../state/generalSettingsStore'
import type { CliCommand, MentionEntry } from '../../../shared/types'

interface Props {
  /** Claude is working: sending still works (the prompt is queued) and Stop replaces Send while the input is empty. */
  busy?: boolean
  /** This session's earlier prompts, newest first, for ↑/↓. */
  history?: readonly string[]
  placeholder?: string
  onSend: (text: string, attachments?: PromptAttachment[]) => void
  onInterrupt?: () => void
  /** The session's CLI commands, from its `initialize` reply. */
  commands?: readonly CliCommand[]
  /** The app's own rows in the slash menu; `attach-file` and `mention-file` are handled here. */
  localActions?: readonly LocalAction[]
  onAction?: (id: string) => void
  /** A CLI command the app opens its own UI for. */
  onOpen?: (target: OpenTarget) => void
  /** Extra content at the end of a slash-menu row, by command id. */
  menuTrailing?: Readonly<Record<string, ReactNode>>
  cwd?: string
  registerFocus?: (focusFn: () => void) => void
  footerStart?: ReactNode
  footerEnd?: ReactNode
  onShiftTab?: () => void
  /** The unsent text the input opens with. */
  initialDraft?: string
  onDraftChange?: (text: string) => void
}

interface MentionState {
  trigger: MentionTrigger
  entries: readonly MentionEntry[]
  /** The query `entries` answer; null before the first answer. */
  answered: string | null
  active: number
}

interface SlashState {
  trigger: SlashTrigger
  /** Set by ↑/↓ or the mouse; otherwise the menu's initial row for this query. */
  picked: { id: string; query: string } | null
}

interface PendingFile extends PromptAttachment {
  id: string
  size: number
  width: number
  height: number
  previewUrl: string
}

const MENTION_DEBOUNCE_MS = 200

const NO_COMMANDS: readonly CliCommand[] = []
const NO_ACTIONS: readonly LocalAction[] = []

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = url
  })
}

/** The extension's `aq`: supported files become attachments, empty ones are skipped, the rest are named. */
async function readFiles(files: readonly File[]): Promise<{ read: PendingFile[]; unsupported: string[] }> {
  const read: PendingFile[] = []
  const unsupported: string[] = []
  for (const file of files) {
    const name = file.name
    if (attachmentKind(file.type.toLowerCase(), name) === 'unsupported') {
      unsupported.push(name)
      continue
    }
    if (file.size === 0) continue
    try {
      const url = await readDataUrl(file)
      const [header, base64] = url.split(',')
      const mediaType = /data:([^;]+)/.exec(header)?.[1]?.toLowerCase() ?? 'application/octet-stream'
      const kind = attachmentKind(mediaType, name)
      if (kind === 'unsupported' || base64 === undefined) continue
      const size = kind === 'image' ? await imageSize(url) : { width: 0, height: 0 }
      read.push({ id: crypto.randomUUID(), kind, mediaType, base64, name, size: file.size, ...size, previewUrl: url })
    } catch {
      continue
    }
  }
  return { read, unsupported }
}

/** Shift+Enter, or Ctrl+J as in the extension. */
function isNewlineKey(e: React.KeyboardEvent): boolean {
  if (e.key === 'Enter' && e.shiftKey) return true
  return e.key.toLowerCase() === 'j' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function InputBox({
  busy = false,
  history = [],
  placeholder,
  onSend,
  onInterrupt,
  commands = NO_COMMANDS,
  localActions = NO_ACTIONS,
  onAction,
  onOpen,
  menuTrailing,
  cwd,
  registerFocus,
  footerStart,
  footerEnd,
  onShiftTab,
  initialDraft = '',
  onDraftChange
}: Props) {
  const [value, setValue] = useState(initialDraft)
  const [mention, setMention] = useState<MentionState | null>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [recall, setRecall] = useState<HistoryCursor>(NO_RECALL)
  const ctrlEnterSends = useGeneralSettingsStore((s) => s.useCtrlEnterToSend)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const menu = useMemo(() => buildMenu(commands, localActions), [commands, localActions])
  const hasMenu = menu.sections.length > 0

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(Math.max(ta.scrollHeight, 24), 240) + 'px'
  }, [value])

  useEffect(() => {
    if (value === '') setRecall(NO_RECALL)
  }, [value])

  const draftChangeRef = useRef(onDraftChange)
  draftChangeRef.current = onDraftChange
  useEffect(() => {
    draftChangeRef.current?.(value)
  }, [value])

  useEffect(() => {
    if (registerFocus) {
      registerFocus(() => textareaRef.current?.focus())
    }
  }, [registerFocus])

  const mentionQuery = mention?.trigger.query ?? null
  useEffect(() => {
    if (mentionQuery === null || !cwd) return
    let stale = false
    const timer = setTimeout(() => {
      void window.api.files
        .mentions(cwd, mentionQuery)
        .catch(() => [])
        .then((entries) => {
          if (!stale) setMention((m) => (m && m.trigger.query === mentionQuery ? { ...m, entries, answered: mentionQuery, active: 0 } : m))
        })
    }, MENTION_DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [mentionQuery, cwd])

  const sections = useMemo(() => (slash ? menuSections(menu, slash.trigger.query) : []), [menu, slash])
  const flat = useMemo(() => sections.flatMap((s) => s.commands), [sections])
  const slashQuery = slash?.trigger.query.toLowerCase() ?? ''
  const pickedId = slash?.picked && slash.picked.query === slashQuery && flat.some((c) => c.id === slash.picked?.id) ? slash.picked.id : null
  const activeId = pickedId ?? initialActive(sections, slashQuery)

  const openMention = (trigger: MentionTrigger | null) =>
    setMention((prev) => (trigger ? { entries: [], answered: null, active: 0, ...prev, trigger } : null))

  const detect = (v: string, caret: number) => {
    const trigger = hasMenu ? slashTrigger(v, caret) : null
    setSlash((prev) => (trigger ? { trigger, picked: prev?.picked ?? null } : null))
    openMention(trigger ? null : mentionTrigger(v, caret))
  }

  const closeMenus = () => {
    setSlash(null)
    setMention(null)
  }

  const updateAutocomplete = () => {
    const ta = textareaRef.current
    if (!ta) return
    detect(value, ta.selectionStart)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setValue(v)
    detect(v, e.target.selectionStart)
  }

  const send = () => {
    const trimmed = value.trim()
    if (!trimmed && pendingFiles.length === 0) return
    const over = overLimitBy(trimmed)
    if (over > 0) {
      setNotice(overLimitNotice('Your prompt', over, 'shorten it to send'))
      return
    }
    const attachments = pendingFiles.map(({ kind, mediaType, base64, name }) => ({ kind, mediaType, base64, name }))
    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setValue('')
    setPendingFiles([])
    setNotice(null)
    closeMenus()
  }

  const placeCaret = (ta: HTMLTextAreaElement, pos: number) =>
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(pos, pos)
    }, 0)

  /** The extension's `Bd`: Tab on a folder drills in with no space; anything else adds the mention and a space. */
  const applyMention = (entry: MentionEntry, drill: boolean) => {
    const ta = textareaRef.current
    if (!mention || !ta) return
    const text = mentionText(entry.path, entry.type)
    if (text === null) {
      setNotice(unmentionableNotice(entry.path))
      return
    }
    const intoFolder = drill && entry.type === 'directory'
    const next = insertMention(value, mention.trigger, text, !intoFolder)
    setValue(next.value)
    openMention(intoFolder ? mentionTrigger(next.value, next.caret) : null)
    placeCaret(ta, next.caret)
  }

  const runLocal = (id: string, ta: HTMLTextAreaElement, nextValue: string, caret: number) => {
    if (id === 'attach-file') return fileInputRef.current?.click()
    if (id === 'mention-file') {
      const inserted = nextValue.slice(0, caret) + '@' + nextValue.slice(caret)
      setValue(inserted)
      openMention(mentionTrigger(inserted, caret + 1))
      return placeCaret(ta, caret + 1)
    }
    onAction?.(id)
  }

  const applyCommand = (cmd: MenuCommand, viaTab: boolean) => {
    const ta = textareaRef.current
    if (!slash || !ta) return
    if (cmd.keepOpen) {
      onAction?.(cmd.id)
      return
    }
    const result = selectCommand(cmd, viaTab, value, slash.trigger)
    setValue(result.value)
    setSlash(null)
    placeCaret(ta, result.caret)
    if (result.kind === 'send') onSend(result.text)
    else if (result.kind === 'open') onOpen?.(result.target)
    else if (result.kind === 'action') runLocal(result.id, ta, result.value, result.caret)
  }

  const insertAtCaret = (ta: HTMLTextAreaElement, text: string) => {
    const start = ta.selectionStart
    const next = value.slice(0, start) + text + value.slice(ta.selectionEnd)
    setValue(next)
    closeMenus()
    setTimeout(() => ta.setSelectionRange(start + text.length, start + text.length), 0)
  }

  const recallPrompt = (ta: HTMLTextAreaElement, direction: 'older' | 'newer'): boolean => {
    const step = stepHistory(recall, history, direction, value)
    if (!step) return false
    setRecall(step.cursor)
    setValue(step.value)
    closeMenus()
    // ↑ leaves the caret at the start so the next ↑ keeps going back; ↓ leaves it at the end.
    const pos = direction === 'older' && step.cursor.index !== -1 ? 0 : step.value.length
    setTimeout(() => ta.setSelectionRange(pos, pos), 0)
    return true
  }

  /** The extension's suggestion keys: arrows wrap, Enter or Tab pick (Tab drills into a folder), Esc closes. */
  const handleMentionKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!mention || mention.answered === null) return false
    const { entries, active } = mention
    if (e.key === 'Escape') {
      setMention(null)
      return true
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && entries.length > 1) {
      const step = e.key === 'ArrowDown' ? 1 : -1
      setMention((m) => m && { ...m, active: (active + step + entries.length) % entries.length })
      return true
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
      const entry = entries[active]
      if (!entry) return false
      if (!e.repeat) applyMention(entry, e.key === 'Tab')
      return true
    }
    return false
  }

  /** The extension's menu keys: arrows wrap, Enter or Tab pick, Esc closes. True when the key was the menu's. */
  const handleSlashKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!slash) return false
    if (e.key === 'Escape') {
      setSlash(null)
      return true
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && flat.length > 0) {
      const id = moveActive(flat, activeId, e.key === 'ArrowDown' ? 'down' : 'up')
      setSlash({ ...slash, picked: id ? { id, query: slashQuery } : null })
      return true
    }
    if ((e.key === 'Tab' || e.key === 'Enter') && !e.shiftKey) {
      const active = flat.find((c) => c.id === activeId)
      const typed = slashQuery.length > 0
      if (e.key === 'Enter' && !active && typed) return false
      const first = flat[0]
      const pick = active ?? (e.key === 'Tab' && typed && first?.slash ? first : undefined)
      if (pick && !e.repeat) applyCommand(pick, e.key === 'Tab')
      return true
    }
    return false
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const ta = e.currentTarget
    if (e.key === 'Tab' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && onShiftTab) {
      e.preventDefault()
      onShiftTab()
      return
    }
    if (handleSlashKey(e)) {
      e.preventDefault()
      return
    }
    if (handleMentionKey(e)) {
      e.preventDefault()
      return
    }
    if (isNewlineKey(e)) {
      e.preventDefault()
      insertAtCaret(ta, '\n')
      return
    }
    const bare = !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
    if (bare && e.key === 'ArrowUp' && ta.selectionStart === 0 && recallPrompt(ta, 'older')) {
      e.preventDefault()
      return
    }
    if (bare && e.key === 'ArrowDown' && ta.selectionEnd === value.length && recallPrompt(ta, 'newer')) {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') {
      const mod = e.ctrlKey || e.metaKey
      e.preventDefault()
      if (ctrlEnterSends && !mod) insertAtCaret(ta, '\n')
      else if (!e.repeat) send()
    }
  }

  const hint = argumentHint(menu, value)

  const addFiles = async (files: readonly File[]) => {
    const { read, unsupported } = await readFiles(files)
    if (read.length > 0) setPendingFiles((prev) => [...prev, ...read])
    const refused = unsupportedNotice(unsupported)
    if (refused) setNotice(refused)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? [])
    const files = items.flatMap((item) => {
      if (item.kind !== 'file' && !item.type.startsWith('image/')) return []
      const file = item.getAsFile()
      return file ? [file] : []
    })
    if (files.length > 0) {
      e.preventDefault()
      void addFiles(files)
      return
    }
    const pasted = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n').trim()
    const over = overLimitBy(pasted)
    if (over > 0) {
      e.preventDefault()
      setNotice(overLimitNotice('That paste', over, 'nothing was added, paste less of it'))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length > 0) void addFiles(files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault()
      setIsDragging(true)
    }
  }

  const handleDragLeave = () => setIsDragging(false)

  const removeFile = (id: string) => setPendingFiles((prev) => prev.filter((p) => p.id !== id))

  const handleAttachClick = () => fileInputRef.current?.click()

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    await addFiles(files)
  }

  const canSend = value.trim().length > 0 || pendingFiles.length > 0

  return (
    <div
      className={
        'bg-editor px-5 pb-3 pt-1 ' +
        (isDragging ? 'ring-2 ring-inset ring-focus' : '')
      }
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <MessageColumn className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        {slash && (
          <SlashMenu
            sections={sections}
            activeId={activeId}
            onSelect={(cmd) => applyCommand(cmd, false)}
            onHover={(id) => {
              if (id !== activeId) setSlash({ ...slash, picked: { id, query: slashQuery } })
            }}
            trailing={menuTrailing}
          />
        )}
        {mention && mention.answered !== null && (
          <MentionMenu
            entries={mention.entries}
            activeIndex={mention.active}
            onHover={(active) => setMention((m) => m && { ...m, active })}
            onPick={applyMention}
          />
        )}
        {notice && (
          <NoticeLine
            action={
              <IconButton label="Close" onClick={() => setNotice(null)}>
                <X size={12} strokeWidth={2.25} />
              </IconButton>
            }
          >
            <span title={notice}>{notice}</span>
          </NoticeLine>
        )}
        {pendingFiles.length > 0 && (
          <FileChipRow>
            {pendingFiles.map((file) => (
              <FileChip
                key={file.id}
                name={file.name}
                meta={(file.width > 0 ? `${file.width}×${file.height} · ` : '') + formatBytes(file.size)}
                thumbnail={file.kind === 'image' ? file.previewUrl : undefined}
                icon={<FileText size={16} strokeWidth={1.75} />}
                onRemove={() => removeFile(file.id)}
              />
            ))}
          </FileChipRow>
        )}
        <div className="flex flex-col gap-1.5 rounded-md border border-strong bg-input px-3 py-2 focus-within:border-focus">
          <div className="relative flex">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onSelect={updateAutocomplete}
              onClick={updateAutocomplete}
              onPaste={handlePaste}
              rows={1}
              placeholder={placeholder ?? 'message claude…'}
              className="min-h-[22px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-fg placeholder:text-muted focus:outline-none"
            />
            {hint && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                <span className="invisible">{value}</span>
                <span data-argument-hint className="text-faint">
                  {hint}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <button
                onClick={handleAttachClick}
                className="rounded p-1.5 text-muted hover:bg-list-hover hover:text-fg"
                title="Attach file"
                type="button"
              >
                <Paperclip size={14} strokeWidth={2} />
              </button>
              {footerStart}
              <span className="min-w-0 truncate text-[10px] text-faint">
                {ctrlEnterSends ? 'ctrl+enter to send · enter newline' : 'enter to send · shift+enter newline'} · / commands · @ files · paste files
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {footerEnd}
              {busy && !canSend && onInterrupt ? (
                <button
                  onClick={onInterrupt}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-error text-accent-fg hover:bg-error/80"
                  title="Stop"
                  aria-label="Stop"
                  type="button"
                >
                  <Square size={12} strokeWidth={2.5} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!canSend}
                  className={
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors ' +
                    (canSend
                      ? 'bg-accent text-accent-fg hover:bg-accent-hover'
                      : 'text-faint')
                  }
                  title="send (enter)"
                  type="button"
                >
                  <ArrowUp size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      </MessageColumn>
    </div>
  )
}
