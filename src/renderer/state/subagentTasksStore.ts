import { create } from 'zustand'
import { applyTaskEvent, endTasks, type SubagentTasks } from '../components/chat/subagents'

interface SubagentTasksState {
  byPane: Record<string, SubagentTasks>
  apply: (paneId: string, event: Record<string, unknown>) => void
  /** The pane's process ended: agents still working are stopped. */
  end: (paneId: string) => void
}

/** Live agent tasks per chat, from the CLI's `system/task_*` events; not saved, as the extension keeps them per process. */
export const useSubagentTasksStore = create<SubagentTasksState>()((set) => ({
  byPane: {},
  apply: (paneId, event) =>
    set((s) => {
      const before = s.byPane[paneId] ?? {}
      const after = applyTaskEvent(before, event, Date.now())
      return after === before ? s : { byPane: { ...s.byPane, [paneId]: after } }
    }),
  end: (paneId) =>
    set((s) => {
      const before = s.byPane[paneId]
      if (!before) return s
      const after = endTasks(before, Date.now())
      return after === before ? s : { byPane: { ...s.byPane, [paneId]: after } }
    })
}))
