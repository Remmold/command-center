import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { fileBaseName, fileKind } from '../../../shared/fileLinks'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { useToastStore } from '../../state/toastStore'
import { ImagePreview } from '../ui/ImagePreview'
import { FileOpenerContext, useFileOpener, type FileOpener } from '../ui/fileOpenerContext'

interface Preview {
  name: string
  path: string
  dataUrl: string
}

function sameFolder(a: string, b: string): boolean {
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** A text file inside an open workspace goes to that workspace's editor; false when there is none to show it in. */
async function openInEditor(cwd: string, relative: string): Promise<boolean> {
  const store = useProjectViewsStore.getState()
  const view = Object.values(store.views).find((v) => sameFolder(v.projectPath, cwd))
  if (!view) return false
  const read = await window.api.files.read(view.projectPath, relative)
  if (!read.ok || read.binary) return false
  store.openFile(view.projectId, { path: relative, content: read.content ?? '', dirty: false })
  store.setActive(view.projectId)
  if (!useProjectViewsStore.getState().views[view.projectId]?.idePanelsOpen) store.toggleIdePanels(view.projectId)
  return true
}

async function openWithSystem(path: string): Promise<void> {
  const error = await window.api.files.openWithSystem(path)
  if (error) useToastStore.getState().show(`Could not open ${fileBaseName(path)}: ${error}`)
}

/** Opens file links for the chat in `cwd`: images in a preview, text in the editor, anything else in its system app. */
export function FileOpenerProvider({ cwd, children }: { cwd: string | undefined; children: ReactNode }) {
  const [preview, setPreview] = useState<Preview | null>(null)

  const open = useCallback(
    async (link: string) => {
      const toast = useToastStore.getState().show
      const found = await window.api.files.resolveLink(cwd ?? '', link)
      if (!found) {
        toast(`Could not open ${link}: file not found`)
        return
      }
      const kind = fileKind(found.path)
      if (kind === 'image') {
        const image = await window.api.files.readImage(found.path)
        if (image.ok) setPreview({ name: fileBaseName(found.path), path: found.path, dataUrl: image.dataUrl })
        else toast(`Could not preview ${fileBaseName(found.path)}: ${image.error}`)
        return
      }
      if (kind === 'text' && cwd && found.relative !== null && (await openInEditor(cwd, found.relative))) return
      await openWithSystem(found.path)
    },
    [cwd]
  )

  const opener = useMemo<FileOpener>(() => ({ open: (path) => void open(path) }), [open])

  return (
    <FileOpenerContext.Provider value={opener}>
      {children}
      {preview && (
        <ImagePreview
          name={preview.name}
          src={preview.dataUrl}
          onClose={() => setPreview(null)}
          onOpenExternally={() => void openWithSystem(preview.path)}
        />
      )}
    </FileOpenerContext.Provider>
  )
}

/** A file name that opens the file, as the extension's file links in tool rows and replies. */
export function FileLink({ path, title, children }: { path: string; title?: string; children: ReactNode }) {
  const opener = useFileOpener()
  if (!opener) return <span title={title ?? path}>{children}</span>
  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    opener.open(path)
  }
  return (
    <a href="#" data-file-link="" title={title ?? path} onClick={onClick} className="text-link hover:underline">
      {children}
    </a>
  )
}
