import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const LINE_PX = 18

/** Shows the first `lines` lines of its content, with Show more when there is more. */
export function Clamp({ lines, children }: { lines: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [children, open])
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div ref={ref} style={open ? undefined : { maxHeight: lines * LINE_PX }} className="w-full overflow-hidden leading-[18px]">
        {children}
      </div>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] text-link hover:underline">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
