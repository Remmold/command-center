import { ExternalLink } from 'lucide-react'
import type { LocalServer } from '../../shared/localPorts'
import { useToastStore } from '../state/toastStore'
import { Button } from './ui/Button'

async function openServer(url: string): Promise<void> {
  const error = await window.api.backgroundProcesses.openInBrowser(url)
  if (error) useToastStore.getState().show(`Could not open ${url}: ${error}`)
}

/** A local server a process serves, opened in the browser. */
export function ServerLink({ server }: { server: LocalServer }) {
  return (
    <Button variant="link" label={`Open ${server.url}`} tooltip={`Open ${server.url} in the browser`} onClick={() => void openServer(server.url)}>
      {server.url.replace(/^https?:\/\//, '')}
      <ExternalLink size={12} aria-hidden />
    </Button>
  )
}
