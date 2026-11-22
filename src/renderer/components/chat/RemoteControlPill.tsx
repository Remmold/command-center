import { Smartphone } from 'lucide-react'
import { StatusPill } from '../ui/StatusPill'
import type { RemoteControlState } from './remoteControl'

const ICON = <Smartphone size={12} strokeWidth={2} />
const LABEL = 'Remote Control'

/** The extension's footer pill: hidden while off, a link to the session once connected. */
export function RemoteControlPill({ state }: { state: RemoteControlState }) {
  if (state.status === 'off') return null
  if (state.status === 'connected') {
    return (
      <StatusPill
        label={LABEL}
        icon={ICON}
        tone="on"
        href={state.sessionUrl}
        tooltip="Remote Control is active · Click to open claude.ai/code · Run /remote-control to turn off"
      />
    )
  }
  if (state.status === 'connecting') return <StatusPill label={LABEL} icon={ICON} tone="on" tooltip="Connecting to claude.ai/code…" />
  return <StatusPill label={LABEL} icon={ICON} tooltip={`Remote Control error: ${state.error} · Run /remote-control to dismiss`} />
}
