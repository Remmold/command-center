import { createContext, useContext } from 'react'
import type { ToolPairs } from './toolCall'

interface ToolContextValue {
  pairs: ToolPairs
  cwd: string | undefined
}

const NO_PAIRS: ToolPairs = { resultFor: new Map(), isPaired: () => false }

export const ToolContext = createContext<ToolContextValue>({ pairs: NO_PAIRS, cwd: undefined })

export function useToolContext(): ToolContextValue {
  return useContext(ToolContext)
}
