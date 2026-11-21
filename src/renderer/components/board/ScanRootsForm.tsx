import { X } from 'lucide-react'
import type { DiscoveryModel } from '../../../shared/types'
import { useBoardStore } from '../../state/boardStore'
import { Button } from '../ui/Button'
import { DrawerList } from '../ui/Drawer'
import { IconButton } from '../ui/IconButton'
import { ListItem, ListRowText } from '../ui/ListRow'
import { PageNote } from '../ui/Page'
import { TextField } from '../ui/TextField'

function lastScan({ scannedAt, scanMs, error }: DiscoveryModel): string {
  if (error !== null) return `Last scan failed: ${error}`
  if (scannedAt === null) return 'Not scanned yet.'
  return `Last scan ${new Date(scannedAt).toLocaleTimeString()}, took ${scanMs ?? 0} ms. Rescans on board open and every 5 minutes.`
}

/** The folders scanned for repos with tickets. */
export function ScanRootsForm() {
  const discovery = useBoardStore((s) => s.discovery)
  const setScanRoots = useBoardStore((s) => s.setScanRoots)
  const rescan = useBoardStore((s) => s.rescan)
  const save = (roots: string[]): void => {
    setScanRoots(roots).catch((err) => console.error('could not save scan roots', err))
  }

  return (
    <>
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
      <div className="flex items-center gap-2">
        <PageNote>{lastScan(discovery)}</PageNote>
        <Button variant="ghost" onClick={rescan}>
          Rescan now
        </Button>
      </div>
    </>
  )
}
