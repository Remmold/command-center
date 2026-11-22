// Formats as the extension's `uq`, `Lqe`, `hq` and `Rqe` with its default "auto" time format.

const LOCALE = 'en-US'

function formatter(options: Intl.DateTimeFormatOptions, timeZone: string | undefined): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE, timeZone ? { ...options, timeZone } : options)
}

function format(at: number, options: Intl.DateTimeFormatOptions, timeZone: string | undefined): Intl.DateTimeFormatPart[] {
  return formatter(options, timeZone).formatToParts(new Date(at))
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? ''
}

/** The stamp next to a message, e.g. "3:07 PM". */
export function stampLabel(at: number, timeZone?: string): string {
  return formatter({ hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }, timeZone).format(new Date(at))
}

/** The stamp's hover text, e.g. "2026-11-22 15:07:42 GMT+1". */
export function stampTitle(at: number, timeZone?: string): string {
  const p = format(
    at,
    { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' },
    timeZone
  )
  const zone = part(p, 'timeZoneName')
  return `${part(p, 'year')}-${part(p, 'month')}-${part(p, 'day')} ${part(p, 'hour')}:${part(p, 'minute')}:${part(p, 'second')}${zone ? ` ${zone}` : ''}`
}

function dayKey(at: number, timeZone: string | undefined): string {
  const p = format(at, { year: 'numeric', month: '2-digit', day: '2-digit' }, timeZone)
  return `${part(p, 'year')}-${part(p, 'month')}-${part(p, 'day')}`
}

/** The date line where the day changes, e.g. "Sun, Nov 22". */
export function dayLabel(at: number, now: number, timeZone?: string): string {
  const sameYear = dayKey(at, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4)
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }
  return formatter(options, timeZone).format(new Date(at))
}

/** For each message time, that time when a date line goes before it: the first stamped message and each one on a new day. */
export function dayBreaks(times: ReadonlyArray<number | undefined>, timeZone?: string): Array<number | undefined> {
  let previous: string | undefined
  return times.map((at) => {
    if (at === undefined) return undefined
    const key = dayKey(at, timeZone)
    const changed = key !== previous
    previous = key
    return changed ? at : undefined
  })
}
