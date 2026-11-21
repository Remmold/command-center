import type { ReactNode } from 'react'

/** The centred column chat content lines up in, messages and input box alike. */
export function MessageColumn({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[800px] ${className}`}>{children}</div>
}
