import { promises as fs } from 'node:fs'
import { BrowserWindow, dialog } from 'electron'

export async function saveAsDialog(
  win: BrowserWindow | null,
  suggestedName: string,
  content: string
): Promise<{ saved: boolean; path?: string }> {
  const result = win
    ? await dialog.showSaveDialog(win, { defaultPath: suggestedName })
    : await dialog.showSaveDialog({ defaultPath: suggestedName })
  if (result.canceled || !result.filePath) return { saved: false }
  await fs.writeFile(result.filePath, content, 'utf-8')
  return { saved: true, path: result.filePath }
}
