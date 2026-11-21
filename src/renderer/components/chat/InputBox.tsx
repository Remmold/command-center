import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Image as ImageIcon, Paperclip, Square, X } from 'lucide-react'
import { AutocompletePopup, type AutocompleteItem } from './AutocompletePopup'
import { MessageColumn } from './MessageColumn'
import { NO_RECALL, stepHistory, type HistoryCursor } from './promptHistory'
import { useGeneralSettingsStore } from '../../state/generalSettingsStore'
import type { ImageAttachment } from '../../../shared/types'

interface Props {
  /** Claude is working: sending still works (the prompt is queued) and Stop replaces Send while the input is empty. */
  busy?: boolean
  /** This session's earlier prompts, newest first, for ↑/↓. */
  history?: readonly string[]
  placeholder?: string
  onSend: (text: string, images?: ImageAttachment[]) => void
  onInterrupt?: () => void
  slashCommands?: string[]
  cwd?: string
  registerFocus?: (focusFn: () => void) => void
  footerStart?: ReactNode
  footerEnd?: ReactNode
  onShiftTab?: () => void
}

interface AutocompleteState {
  type: 'slash' | 'mention'
  triggerStart: number
  query: string
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

function detectTrigger(
  value: string,
  cursor: number,
  hasSlashCommands: boolean
): AutocompleteState | null {
  if (hasSlashCommands && value.startsWith('/')) {
    const beforeCursor = value.slice(0, cursor)
    if (!/\s/.test(beforeCursor)) {
      return { type: 'slash', triggerStart: 0, query: beforeCursor.slice(1) }
    }
  }
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i]
    if (ch === '@') {
      const before = i === 0 ? '' : value[i - 1]
      if (i === 0 || /\s/.test(before)) {
        const query = value.slice(i + 1, cursor)
        if (!/\s/.test(query)) {
          return { type: 'mention', triggerStart: i, query }
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
  slashCommands,
  cwd,
  registerFocus,
  footerStart,
  footerEnd,
  onShiftTab
}: Props) {
  const [value, setValue] = useState('')
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [recall, setRecall] = useState<HistoryCursor>(NO_RECALL)
  const ctrlEnterSends = useGeneralSettingsStore((s) => s.useCtrlEnterToSend)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
    if (autocomplete?.type === 'mention' && cwd && allFiles.length === 0) {
      void window.api.files.list(cwd).then((files) => setAllFiles(files))
    }
  }, [autocomplete?.type, cwd, allFiles.length])

  let items: AutocompleteItem[] = []
  if (autocomplete?.type === 'slash' && slashCommands) {
    items = slashCommands
      .filter((cmd) => fuzzyMatch(cmd, autocomplete.query))
      .map((cmd) => ({ id: cmd, primary: '/' + cmd }))
      .sort(
        (a, b) =>
          fuzzyRank(a.primary.slice(1), autocomplete.query) -
          fuzzyRank(b.primary.slice(1), autocomplete.query)
      )
      .slice(0, 30)
  } else if (autocomplete?.type === 'mention') {
    items = allFiles
      .filter((path) => fuzzyMatch(path, autocomplete.query))
      .sort((a, b) => fuzzyRank(a, autocomplete.query) - fuzzyRank(b, autocomplete.query))
      .slice(0, 30)
      .map((path) => ({ id: path, primary: path }))
  }

  useEffect(() => {
    setSelectedIndex(0)
  }, [autocomplete?.query, autocomplete?.type])

  const updateAutocomplete = () => {
    const ta = textareaRef.current
    if (!ta) return
    setAutocomplete(detectTrigger(value, ta.selectionStart, !!slashCommands?.length))
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setValue(v)
    setAutocomplete(detectTrigger(v, e.target.selectionStart, !!slashCommands?.length))
  }

  const send = () => {
    const trimmed = value.trim()
    if (!trimmed && pendingImages.length === 0) return
    const images = pendingImages.map((p) => ({ media_type: p.media_type, data: p.data }))
    onSend(trimmed, images.length > 0 ? images : undefined)
    setValue('')
    setPendingImages([])
    setAutocomplete(null)
  }

  const applySelection = (item: AutocompleteItem) => {
    if (!autocomplete) return
    const ta = textareaRef.current
    if (!ta) return
    const cursor = ta.selectionStart
    const before = value.slice(0, autocomplete.triggerStart)
    const after = value.slice(cursor)
    const inserted = autocomplete.type === 'slash' ? item.primary : '@' + item.primary
    const newValue = before + inserted + ' ' + after
    setValue(newValue)
    setAutocomplete(null)
    setTimeout(() => {
      ta.focus()
      const pos = before.length + inserted.length + 1
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  const insertAtCaret = (ta: HTMLTextAreaElement, text: string) => {
    const start = ta.selectionStart
    const next = value.slice(0, start) + text + value.slice(ta.selectionEnd)
    setValue(next)
    setAutocomplete(null)
    setTimeout(() => ta.setSelectionRange(start + text.length, start + text.length), 0)
  }

  const recallPrompt = (ta: HTMLTextAreaElement, direction: 'older' | 'newer'): boolean => {
    const step = stepHistory(recall, history, direction, value)
    if (!step) return false
    setRecall(step.cursor)
    setValue(step.value)
    setAutocomplete(null)
    // ↑ leaves the caret at the start so the next ↑ keeps going back; ↓ leaves it at the end.
    const pos = direction === 'older' && step.cursor.index !== -1 ? 0 : step.value.length
    setTimeout(() => ta.setSelectionRange(pos, pos), 0)
    return true
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const ta = e.currentTarget
    if (e.key === 'Tab' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && onShiftTab) {
      e.preventDefault()
      onShiftTab()
      return
    }
    if (e.key === 'Escape' && autocomplete && items.length > 0) {
      e.preventDefault()
      setAutocomplete(null)
      return
    }
    if (isNewlineKey(e)) {
      e.preventDefault()
      insertAtCaret(ta, '\n')
      return
    }
    if (autocomplete && items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applySelection(items[selectedIndex])
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
        {autocomplete && items.length > 0 && (
          <AutocompletePopup
            items={items}
            selectedIndex={selectedIndex}
            onSelect={applySelection}
            onHoverIndex={setSelectedIndex}
            header={autocomplete.type === 'slash' ? 'slash commands' : 'mention a file'}
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
            className="min-h-[22px] resize-none bg-transparent text-[13px] leading-relaxed text-fg placeholder:text-muted focus:outline-none"
          />
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
