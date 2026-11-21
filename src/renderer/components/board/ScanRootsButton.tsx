import { FolderSearch } from 'lucide-react'
import { useViewStore } from '../../state/viewStore'
import { IconButton } from '../ui/IconButton'

/** Opens Settings → Board, where the scan roots live. */
export function ScanRootsButton() {
  const openSettings = useViewStore((s) => s.openSettings)
  return (
    <IconButton label="Board settings" tooltip="Folders scanned for repos with tickets (Settings → Board)" onClick={() => openSettings('board')}>
      <FolderSearch size={14} />
    </IconButton>
  )
}
