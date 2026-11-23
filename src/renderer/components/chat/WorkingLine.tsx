import { memo, useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import type { PermissionMode } from '../../state/permissionModes'
import {
  LABEL_WIDTH,
  SPINNER_CYCLE,
  SPINNER_FRAME_MS,
  SPINNER_VERBS,
  STATIC_GLYPH,
  TYPE_STEP_MS,
  padTo,
  randomPick,
  typeStep,
  typingDone,
  verbDelay,
  workingLabel
} from './workingSpinner'

const COMPACTING = 'Compacting'

/** The extension tints the glyph by permission mode. */
const GLYPH_TONE: Partial<Record<PermissionMode, string>> = {
  acceptEdits: 'text-fg',
  plan: 'text-accent',
  bypassPermissions: 'text-error',
  auto: 'text-error'
}

/** The extension's spinner row at the end of a running turn: a cycling glyph and a rotating verb typed in. Each part redraws only itself. */
export const WorkingLine = memo(function WorkingLine({ mode, compacting = false }: { mode?: PermissionMode; compacting?: boolean }) {
  const reducedMotion = usePrefersReducedMotion()
  return (
    <div data-working-line="" className="mt-1 flex h-[1.85em] animate-fade-in items-center">
      <span className="inline-flex items-center gap-1 text-fg">
        <Glyph reducedMotion={reducedMotion} tone={(mode && GLYPH_TONE[mode]) ?? 'text-spinner'} />
        <Verb reducedMotion={reducedMotion} compacting={compacting} />
        <span className="sr-only">{compacting ? 'Compacting conversation' : 'Claude is working'}</span>
      </span>
    </div>
  )
})

function Glyph({ reducedMotion, tone }: { reducedMotion: boolean; tone: string }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (reducedMotion) return
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER_CYCLE.length), SPINNER_FRAME_MS)
    return () => clearInterval(timer)
  }, [reducedMotion])
  return (
    <span aria-hidden className={`inline-block w-[1.5em] text-center font-mono text-[16px] ${tone}`}>
      {reducedMotion ? STATIC_GLYPH : SPINNER_CYCLE[frame]}
    </span>
  )
}

function Verb({ reducedMotion, compacting }: { reducedMotion: boolean; compacting: boolean }) {
  const [verb, setVerb] = useState(() => randomPick(SPINNER_VERBS))
  useEffect(() => {
    let changes = 0
    let timer: ReturnType<typeof setTimeout>
    const next = (): void => {
      setVerb(randomPick(SPINNER_VERBS))
      timer = setTimeout(next, verbDelay(++changes))
    }
    timer = setTimeout(next, verbDelay(changes))
    return () => clearTimeout(timer)
  }, [])
  const shown = compacting ? COMPACTING : verb
  const text = useTyped(padTo(workingLabel(shown), LABEL_WIDTH), reducedMotion)
  return (
    <span aria-hidden data-working-verb={shown} className="whitespace-pre font-medium">
      {text}
    </span>
  )
}

/** Types `target` in over what was shown, one step each `TYPE_STEP_MS`; shows it at once when motion is reduced. */
function useTyped(target: string, reducedMotion: boolean): string {
  const [text, setText] = useState(() => (reducedMotion ? target : ' '.repeat(target.length)))
  useEffect(() => {
    if (reducedMotion) {
      setText(target)
      return
    }
    let index = 0
    let last = 0
    let frame = requestAnimationFrame(function step(now) {
      if (now - last < TYPE_STEP_MS) {
        frame = requestAnimationFrame(step)
        return
      }
      last = now
      if (typingDone(index, target)) return
      const at = index++
      setText((shown) => typeStep(padTo(shown, target.length).slice(0, target.length), target, at, randomPick))
      frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, reducedMotion])
  return text
}
