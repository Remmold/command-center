import { useCallback, useRef, useState } from 'react'
import { FolderSearch, X } from 'lucide-react'
import type { DiscoveryModel } from '../../../shared/types'
import { useBoardStore } from '../../state/boardStore'
import { Button } from '../ui/Button'
import { DrawerList } from '../ui/Drawer'
import { IconButton } from '../ui/IconButton'
import { ListItem, ListRowText } from '../ui/ListRow'
import { Popover, PopoverActions, PopoverNote, PopoverSection } from '../ui/Popover'
import { SectionLabel } from '../ui/SectionLabel'
import { TextField } from '../ui/TextField'

function lastScan({ scannedAt, scanMs, error }: DiscoveryModel): string {
  if (error !== null) return `Last scan failed: ${error}`
  if (scannedAt === null) return 'Not scanned yet.'
  return `Last scan ${new Date(scannedAt).toLocaleTimeString()}, took ${scanMs ?? 0} ms. Rescans on board open and every 5 minutes.`
}

/** Board settings: the folders scanned for repos with tickets. */
export function ScanRootsButton() {
  const discovery = useBoardStore((s) => s.discovery)
  const setScanRoots = useBoardStore((s) => s.setScanRoots)
  const rescan = useBoardStore((s) => s.rescan)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const save = (roots: string[]): void => {
    setScanRoots(roots).catch((err) => console.error('could not save scan roots', err))
  }

  return (
    <>
      <IconButton ref={anchor} label="Board settings" tooltip="Folders scanned for repos with tickets" onClick={() => setOpen((o) => !o)}>
        <FolderSearch size={14} />
      </IconButton>
      <Popover open={open} onClose={close} anchor={anchor.current} label="Board settings">
        <PopoverSection>
          <SectionLabel>Scan roots</SectionLabel>
          <DrawerList>
            {discovery.scanRoots.map((root) => (
              <ListItem key={root} tooltip={root}>
                <ListRowText primary={root} />
                <IconButton label={`Stop scanning ${root}`} onClick={() => save(discovery.scanRoots.filter((r) => r !== root))}>
                  <X size={12} />
                </IconButton>
              </ListItem>
            ))}
          </DrawerList>
          <TextField
            label="Add a scan root"
            placeholder="Add a folder, e.g. C:\projects"
            onSubmit={(root) => save([...discovery.scanRoots, root])}
          />
          <PopoverNote>{lastScan(discovery)}</PopoverNote>
          <PopoverActions>
            <Button variant="ghost" onClick={rescan}>
              Rescan now
            </Button>
          </PopoverActions>
        </PopoverSection>
      </Popover>
    </>
  )
}
