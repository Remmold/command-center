import type { UpdateStatus } from '../../shared/types'
import { stampTitle } from '../components/chat/messageTime'

/** The muted line under Settings → General → Updates. */
export function lastCheckLabel(status: UpdateStatus, timeZone?: string): string {
  if (status.checking) return 'Checking…'
  if (status.lastCheck === null) return 'Not checked yet'
  const when = stampTitle(status.lastCheck, timeZone)
  if (status.error) return `Check failed ${when}: ${status.error}`
  return status.downloaded ? `Version ${status.downloaded} is ready · last checked ${when}` : `Last checked ${when}`
}
