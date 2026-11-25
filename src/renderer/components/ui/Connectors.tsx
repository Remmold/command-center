import { useLayoutEffect, useRef, useState } from 'react'

export interface Connector {
  from: string
  to: string
}

interface Line {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Props {
  connectors: readonly Connector[]
  label: string
}

function centre(el: Element, origin: DOMRect): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2 }
}

/** Lines between the `[data-node]` elements of its positioned parent, drawn behind them when placed first; redrawn when the parent resizes. */
export function Connectors({ connectors, label }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [lines, setLines] = useState<Line[]>([])

  useLayoutEffect(() => {
    const root = svg.current?.parentElement
    if (!root) return
    const measure = (): void => {
      const origin = root.getBoundingClientRect()
      const nodes = new Map([...root.querySelectorAll('[data-node]')].map((el) => [el.getAttribute('data-node'), el]))
      const node = (id: string): Element | undefined => nodes.get(id)
      setLines(
        connectors.flatMap((c) => {
          const a = node(c.from)
          const b = node(c.to)
          if (!a || !b) return []
          const p = centre(a, origin)
          const q = centre(b, origin)
          return [{ key: `${c.from}->${c.to}`, x1: p.x, y1: p.y, x2: q.x, y2: q.y }]
        })
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [connectors])

  return (
    <svg ref={svg} aria-label={label} aria-hidden={lines.length === 0} role="img" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-faint">
      {lines.map((l) => (
        <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="currentColor" strokeWidth={1.5} />
      ))}
    </svg>
  )
}
