import type { BoardColumn, BoardFeature, BoardModel, BoardRepoGroup, BoardTicket, Workspace } from '../../shared/types'

export const COLUMNS: { column: BoardColumn; title: string }[] = [
  { column: 'backlog', title: 'Backlog' },
  { column: 'blocked', title: 'Blocked' },
  { column: 'in-progress', title: 'In progress' },
  { column: 'done', title: 'Done' }
]

const MAIN_TAG = 'main'

export function worktreeLabel(workspace: Workspace | undefined): string {
  return workspace?.worktreeTag || MAIN_TAG
}

export function refOf(repoGroupKey: string, feature: BoardFeature, ticket: BoardTicket): TicketRef {
  return { repoGroupKey, featureName: feature.name, fileName: ticket.fileName }
}

export interface BoardFilter {
  repoGroupKey: string | null
  workspaceId: string | null
}

export interface TicketRef {
  repoGroupKey: string
  featureName: string
  fileName: string
}

export interface PlacedFeature {
  key: string
  repoGroupKey: string
  repoName: string
  feature: BoardFeature
  /** The feature's tickets that pass the workspace filter. */
  tickets: BoardTicket[]
}

export interface BoardLayout {
  /** Features still open, spec-only or empty; one row each. */
  rows: PlacedFeature[]
  finished: PlacedFeature[]
  counts: Record<BoardColumn, number>
}

function placeFeature(group: BoardRepoGroup, feature: BoardFeature, workspaceId: string | null): PlacedFeature | null {
  const inWorkspace = (sightings: { workspaceId: string }[]): boolean =>
    workspaceId === null || sightings.some((s) => s.workspaceId === workspaceId)
  if (!inWorkspace(feature.sightings)) return null
  return {
    key: `${group.repoGroupKey}/${feature.name}`,
    repoGroupKey: group.repoGroupKey,
    repoName: group.repoName,
    feature,
    tickets: feature.tickets.filter((t) => inWorkspace(t.sightings))
  }
}

export function layoutBoard(model: BoardModel, filter: BoardFilter): BoardLayout {
  const layout: BoardLayout = { rows: [], finished: [], counts: { backlog: 0, blocked: 0, 'in-progress': 0, done: 0 } }
  const repoGroupKey = model.repoGroups.some((g) => g.repoGroupKey === filter.repoGroupKey) ? filter.repoGroupKey : null
  for (const group of model.repoGroups) {
    if (repoGroupKey !== null && group.repoGroupKey !== repoGroupKey) continue
    for (const feature of group.features) {
      const placed = placeFeature(group, feature, filter.workspaceId)
      if (!placed) continue
      if (feature.state === 'finished') {
        layout.finished.push(placed)
        continue
      }
      layout.rows.push(placed)
      for (const t of placed.tickets) layout.counts[t.column]++
    }
  }
  return layout
}

export interface FoundTicket {
  group: BoardRepoGroup
  feature: BoardFeature
  ticket: BoardTicket
}

export function findTicket(model: BoardModel, ref: TicketRef): FoundTicket | null {
  const group = model.repoGroups.find((g) => g.repoGroupKey === ref.repoGroupKey)
  const feature = group?.features.find((f) => f.name === ref.featureName)
  const ticket = feature?.tickets.find((t) => t.fileName === ref.fileName)
  return group && feature && ticket ? { group, feature, ticket } : null
}

export function sameTicket(a: TicketRef | null, b: TicketRef): boolean {
  return a !== null && a.repoGroupKey === b.repoGroupKey && a.featureName === b.featureName && a.fileName === b.fileName
}
