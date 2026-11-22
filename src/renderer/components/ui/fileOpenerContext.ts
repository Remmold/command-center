import { createContext, useContext } from 'react'

/** Opens a file a chat links to; provided around a chat's items. */
export interface FileOpener {
  open: (path: string) => void
}

export const FileOpenerContext = createContext<FileOpener | null>(null)

export function useFileOpener(): FileOpener | null {
  return useContext(FileOpenerContext)
}
