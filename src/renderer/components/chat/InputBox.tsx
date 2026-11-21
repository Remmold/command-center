import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Image as ImageIcon, Paperclip, Square, X } from 'lucide-react'
import { AutocompletePopup, type AutocompleteItem } from './AutocompletePopup'
import { SlashMenu } from './SlashMenu'
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
import type { CliCommand, ImageAttachment } from '../../../shared/types'

interface Props {
  /** Claude is working: sending still works (the prompt is queued) and Stop replaces Send while the input is empty. */
  busy?: boolean
  /** This session's earlier prompts, newest first, for ↑/↓. */
  history?: readonly string[]
  placeholder?: string
  onSend: (text: string, images?: ImageAttachment[]) => void
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
}

interface MentionState {
  triggerStart: number
  query: string
}

interface SlashState {
  trigger: SlashTrigger
  /** Set by ↑/↓ or the mouse; otherwise the menu's initial row for this query. */
  picked: { id: string; query: string } | null
}

interface PendingImage {
  id: string
  filename: string
  size: number
  width: number
  height: number
  media_type: string
  data: string
  previewUrl: string
}

const NO_COMMANDS: readonly CliCommand[] = []
const NO_ACTIONS: readonly LocalAction[] = []

function detectMention(value: string, cursor: number): MentionState | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i]
    if (ch === '@') {
      const before = i === 0 ? '' : value[i - 1]
      if (i === 0 || /\s/.test(before)) {
        const query = value.slice(i + 1, cursor)
        if (!/\s/.test(query)) {
          return { triggerStart: i, query }
        }
      }
      break
    }
    if (/\s/.test(ch)) break
  }
  return null
}

function fuzzyRank(item: string, query: string): number {
  if (!query) return 0
  const lowerItem = item.toLowerCase()
  const lowerQuery = query.toLowerCase()
  if (lowerItem.startsWith(lowerQuery)) return 0
  const idx = lowerItem.indexOf(lowerQuery)
  if (idx >= 0) return 100 + idx
  return 999
}

function fuzzyMatch(item: string, query: string): boolean {
  if (!query) return true
  return item.toLowerCase().includes(query.toLowerCase())
}

function readFileAsImage(file: File): Promise<PendingImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const comma = dataUrl.indexOf(',')
      const data = dataUrl.slice(comma + 1)
      const img = new Image()
      const finish = (w: number, h: number) =>
        resolve({
          id: crypto.randomUUID(),
          filename: file.name || 'pasted-image.png',
          size: file.size,
          width: w,
          height: h,
          media_type: file.type || 'image/png',
          data,
          previewUrl: dataUrl
        })
      img.onload = () => finish(img.naturalWidth, img.naturalHeight)
      img.onerror = () => finish(0, 0)
      img.src = dataUrl
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
  onShiftTab
}: Props) {
  const [value, setValue] = useState('')
  const [mention, setMention] = useState<MentionState | null>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
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

  useEffect(() => {
    if (registerFocus) {
      registerFocus(() => textareaRef.current?.focus())
    }
  }, [registerFocus])

  useEffect(() => {
    if (mention && cwd && allFiles.length === 0) {
      void window.api.files.list(cwd).then((files) => setAllFiles(files))
    }
  }, [mention, cwd, allFiles.length])

  const mentionItems: AutocompleteItem[] = mention
    ? allFiles
        .filter((path) => fuzzyMatch(path, mention.query))
        .sort((a, b) => fuzzyRank(a, mention.query) - fuzzyRank(b, mention.query))
        .slice(0, 30)
        .map((path) => ({ id: path, primary: path }))
    : []

  const sections = useMemo(() => (slash ? menuSections(menu, slash.trigger.query) : []), [menu, slash])
  const flat = useMemo(() => sections.flatMap((s) => s.commands), [sections])
  const slashQuery = slash?.trigger.query.toLowerCase() ?? ''
  const pickedId = slash?.picked && slash.picked.query === slashQuery && flat.some((c) => c.id === slash.picked?.id) ? slash.picked.id : null
  const activeId = pickedId ?? initialActive(sections, slashQuery)

  useEffect(() => {
    setSelectedIndex(0)
  }, [mention?.query])

  const detect = (v: string, caret: number) => {
    const trigger = hasMenu ? slashTrigger(v, caret) : null
    setSlash((prev) => (trigger ? { trigger, picked: prev?.picked ?? null } : null))
    setMention(trigger ? null : detectMention(v, caret))
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
    if (!trimmed && pendingImages.length === 0) return
    const images = pendingImages.map((p) => ({ media_type: p.media_type, data: p.data }))
    onSend(trimmed, images.length > 0 ? images : undefined)
    setValue('')
    setPendingImages([])
    closeMenus()
  }

  const placeCaret = (ta: HTMLTextAreaElement, pos: number) =>
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(pos, pos)
    }, 0)

  const applyMention = (item: AutocompleteItem) => {
    const ta = textareaRef.current
    if (!mention || !ta) return
    const before = value.slice(0, mention.triggerStart)
    const inserted = '@' + item.primary
    setValue(before + inserted + ' ' + value.slice(ta.selectionStart))
    setMention(null)
    placeCaret(ta, before.length + inserted.length + 1)
  }

  const runLocal = (id: string, ta: HTMLTextAreaElement, nextValue: string, caret: number) => {
    if (id === 'attach-file') return fileInputRef.current?.click()
    if (id === 'mention-file') {
      const inserted = nextValue.slice(0, caret) + '@' + nextValue.slice(caret)
      setValue(inserted)
      setMention({ triggerStart: caret, query: '' })
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
    if (e.key === 'Escape' && mention && mentionItems.length > 0) {
      e.preventDefault()
      setMention(null)
      return
    }
    if (isNewlineKey(e)) {
      e.preventDefault()
      insertAtCaret(ta, '\n')
      return
    }
    if (mention && mentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, mentionItems.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyMention(mentionItems[selectedIndex])
        return
      }
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

  const ingestFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (imgs.length === 0) return
    const newImages: PendingImage[] = []
    for (const f of imgs) {
      try {
        newImages.push(await readFileAsImage(f))
      } catch {
        // ignore
      }
    }
    if (newImages.length > 0) setPendingImages((prev) => [...prev, ...newImages])
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      await ingestFiles(imageFiles)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer?.files ?? [])
    await ingestFiles(files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault()
      setIsDragging(true)
    }
  }

  const handleDragLeave = () => setIsDragging(false)

  const removeImage = (id: string) =>
    setPendingImages((prev) => prev.filter((p) => p.id !== id))

  const handleAttachClick = () => fileInputRef.current?.click()

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    await ingestFiles(files)
    e.target.value = ''
  }

  const canSend = value.trim().length > 0 || pendingImages.length > 0

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
          accept="image/*"
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
        {mention && mentionItems.length > 0 && (
          <AutocompletePopup
            items={mentionItems}
            selectedIndex={selectedIndex}
            onSelect={applyMention}
            onHoverIndex={setSelectedIndex}
            header="mention a file"
          />
        )}
        {pendingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingImages.map((img) => (
              <div
                key={img.id}
                className="group flex items-center gap-2 rounded-md border border-subtle bg-sidebar py-1.5 pl-1.5 pr-2"
              >
                <img
                  src={img.previewUrl}
                  alt={img.filename}
                  className="h-9 w-9 shrink-0 rounded object-cover"
                />
                <div className="min-w-0 max-w-[200px]">
                  <div className="truncate text-[12px] text-fg" title={img.filename}>
                    {img.filename}
                  </div>
                  <div className="truncate text-[10px] text-muted">
                    {img.width > 0 && `${img.width}×${img.height} · `}
                    {formatBytes(img.size)}
                  </div>
                </div>
                <button
                  onClick={() => removeImage(img.id)}
                  className="rounded p-0.5 text-muted hover:bg-list-hover hover:text-error"
                  aria-label="remove image"
                >
                  <X size={12} strokeWidth={2.25} />
                </button>
              </div>
            ))}
          </div>
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
                title="attach image"
                type="button"
              >
                <Paperclip size={14} strokeWidth={2} />
              </button>
              {footerStart}
              <span className="min-w-0 truncate text-[10px] text-faint">
                {ctrlEnterSends ? 'ctrl+enter to send · enter newline' : 'enter to send · shift+enter newline'} · / commands · @ files ·{' '}
                <ImageIcon
                  size={10}
                  strokeWidth={2}
                  className="inline-block align-text-bottom"
                />{' '}
                paste images
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
