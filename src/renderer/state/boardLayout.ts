import type {
  BoardColumn,
  BoardFeature,
  BoardModel,
  BoardRepoGroup,
  BoardTicket,
  DiscoveredRepo,
  Workspace
} from '../../shared/types'

export const COLUMN_TITLE: Record<BoardColumn, string> = {
  backlog: 'Backlog',
  blocked: 'Blocked',
  'in-progress': 'In progress',
  done: 'Done'
}

const COLUMN_ORDER: BoardColumn[] = ['backlog', 'blocked', 'in-progress', 'done']

const MAIN_TAG = 'main'

export function worktreeLabel(workspace: Workspace | undefined): string {
  return workspace?.worktreeTag || MAIN_TAG
}

export interface TicketRef {
  repoGroupKey: string
  featureName: string
  fileName: string
}

export function refOf(repoGroupKey: string, feature: BoardFeature, ticket: BoardTicket): TicketRef {
  return { repoGroupKey, featureName: feature.name, fileName: ticket.fileName }
}

function sameTicket(a: TicketRef | null, b: TicketRef): boolean {
  return a !== null && a.repoGroupKey === b.repoGroupKey && a.featureName === b.featureName && a.fileName === b.fileName
}

export interface BoardFilter {
  /** Empty means every repo. */
  repoGroupKeys: string[]
  /** featureKey values; empty, or none of them in the selected repos, means every feature. */
  featureKeys: string[]
  search: string
}

export type GroupBy = 'none' | 'feature' | 'repo'

export interface BoardViewOptions {
  filter: BoardFilter
  groupBy: GroupBy
  showFinished: boolean
}

function featureKey(repoGroupKey: string, featureName: string): string {
  return `${repoGroupKey}/${featureName}`
}

interface CardBase {
  key: string
  repoGroupKey: string
  repoName: string
  feature: BoardFeature
}

export type TicketBoardCard = CardBase & { kind: 'ticket'; ref: TicketRef; ticket: BoardTicket; blockers: string[] }
export type SpecOnlyBoardCard = CardBase & { kind: 'spec-only' }
export type BoardCard = TicketBoardCard | SpecOnlyBoardCard

export function cardKeyOf(ref: TicketRef): string {
  return `${featureKey(ref.repoGroupKey, ref.featureName)}/${ref.fileName}`
}

export interface LaneColumn {
  column: BoardColumn
  cards: BoardCard[]
  /** Done cards of finished features, counted whether they are shown or hidden. */
  finished: { cards: number; features: number }
}

export interface BoardLane {
  key: string
  /** Null for the single lane of an ungrouped board. */
  header: LaneHeader | null
  columns: LaneColumn[]
}

export interface LaneHeader {
  repoGroupKey: string
  repoName: string
  /** Null for a repo lane. */
  featureName: string | null
  progress: { done: number; total: number; lastNote: string | null }
}

export interface BoardLayout {
  lanes: BoardLane[]
}

/** "02" < "02b" < "03" < "112". */
function compareTicketNumbers(a: string, b: string): number {
  const split = (n: string): [number, string] => {
    const m = /^(\d+)(.*)$/.exec(n)
    return m ? [Number(m[1]), m[2]] : [Number.POSITIVE_INFINITY, n]
  }
  const [an, as] = split(a)
  const [bn, bs] = split(b)
  return an - bn || as.localeCompare(bs)
}

function compareRepos(a: BoardRepoGroup, b: BoardRepoGroup): number {
  return a.repoName.toLowerCase().localeCompare(b.repoName.toLowerCase()) || a.repoGroupKey.localeCompare(b.repoGroupKey)
}

function byName(a: BoardFeature, b: BoardFeature): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
}

function emptyColumns(): LaneColumn[] {
  return COLUMN_ORDER.map((column) => ({ column, cards: [], finished: { cards: 0, features: 0 } }))
}

/** Same rule as the board reader: a number is resolved once every ticket file carrying it is done. */
function unresolvedBlockers(feature: BoardFeature, ticket: BoardTicket): string[] {
  const numbers = [...new Set(ticket.sightings.flatMap((s) => s.blockedBy))]
  return numbers.filter((n) => {
    const carriers = feature.tickets.filter((t) => t.number === n)
    return carriers.length === 0 || carriers.some((t) => t.column !== 'done')
  })
}

function cardsOf(group: BoardRepoGroup, feature: BoardFeature): BoardCard[] {
  const base = { repoGroupKey: group.repoGroupKey, repoName: group.repoName, feature }
  const fKey = featureKey(group.repoGroupKey, feature.name)
  if (feature.state === 'spec-only') return [{ ...base, kind: 'spec-only', key: fKey }]
  return [...feature.tickets]
    .sort((a, b) => compareTicketNumbers(a.number, b.number) || a.fileName.localeCompare(b.fileName))
    .map((ticket) => {
      const ref = refOf(group.repoGroupKey, feature, ticket)
      return { ...base, kind: 'ticket', key: cardKeyOf(ref), ref, ticket, blockers: unresolvedBlockers(feature, ticket) }
    })
}

function columnOf(card: BoardCard): BoardColumn {
  return card.kind === 'ticket' ? card.ticket.column : 'backlog'
}

function matchesSearch(card: BoardCard, needle: string): boolean {
  if (needle === '') return true
  const haystack =
    card.kind === 'ticket'
      ? [card.ticket.number, card.ticket.title, card.ticket.statusNote ?? card.ticket.statusLine ?? '']
      : [card.feature.name]
  return haystack.some((text) => text.toLowerCase().includes(needle))
}

interface Scope {
  groups: BoardRepoGroup[]
  /** Null means every feature of those groups. */
  featureKeys: Set<string> | null
}

function scopeOf(model: BoardModel, filter: BoardFilter): Scope {
  const known = new Set(model.repoGroups.map((g) => g.repoGroupKey))
  const repoKeys = new Set(filter.repoGroupKeys.filter((k) => known.has(k)))
  const groups = [...model.repoGroups].filter((g) => repoKeys.size === 0 || repoKeys.has(g.repoGroupKey)).sort(compareRepos)
  const available = new Set(groups.flatMap((g) => g.features.map((f) => featureKey(g.repoGroupKey, f.name))))
  const chosen = filter.featureKeys.filter((k) => available.has(k))
  return { groups, featureKeys: chosen.length > 0 ? new Set(chosen) : null }
}

function place(lane: BoardLane, group: BoardRepoGroup, feature: BoardFeature, options: BoardViewOptions): void {
  const needle = options.filter.search.trim().toLowerCase()
  const cards = cardsOf(group, feature).filter((card) => matchesSearch(card, needle))
  const finished = feature.state === 'finished'
  if (finished && cards.length > 0) {
    const done = lane.columns.find((c) => c.column === 'done')
    if (done) done.finished = { cards: done.finished.cards + cards.length, features: done.finished.features + 1 }
    if (!options.showFinished) return
  }
  for (const card of cards) lane.columns.find((c) => c.column === columnOf(card))?.cards.push(card)
}

function laneFor(lanes: BoardLane[], group: BoardRepoGroup, feature: BoardFeature, groupBy: GroupBy): BoardLane {
  const key =
    groupBy === 'none' ? 'all' : groupBy === 'repo' ? `repo:${group.repoGroupKey}` : `feature:${featureKey(group.repoGroupKey, feature.name)}`
  let lane = lanes.find((l) => l.key === key)
  if (!lane) {
    const header: LaneHeader | null =
      groupBy === 'none'
        ? null
        : {
            repoGroupKey: group.repoGroupKey,
            repoName: group.repoName,
            featureName: groupBy === 'feature' ? feature.name : null,
            progress: { done: 0, total: 0, lastNote: groupBy === 'feature' ? feature.progress.lastNote : null }
          }
    lane = { key, header, columns: emptyColumns() }
    lanes.push(lane)
  }
  if (lane.header) {
    lane.header.progress.done += feature.progress.done
    lane.header.progress.total += feature.progress.total
  }
  return lane
}

function hasCards(lane: BoardLane): boolean {
  return lane.columns.some((c) => c.cards.length > 0)
}

export function layoutBoard(model: BoardModel, options: BoardViewOptions): BoardLayout {
  const lanes: BoardLane[] = []
  const scope = scopeOf(model, options.filter)
  for (const group of scope.groups) {
    for (const feature of [...group.features].sort(byName)) {
      if (scope.featureKeys && !scope.featureKeys.has(featureKey(group.repoGroupKey, feature.name))) continue
      place(laneFor(lanes, group, feature, options.groupBy), group, feature, options)
    }
  }
  if (options.groupBy === 'none') return { lanes: lanes.length > 0 ? lanes : [{ key: 'all', header: null, columns: emptyColumns() }] }
  return { lanes: lanes.filter(hasCards) }
}

/** The ticket card above or below this one in its lane's column; null at either end or when it isn't shown. */
export function neighbourCard(layout: BoardLayout, ref: TicketRef, direction: 'up' | 'down'): TicketRef | null {
  for (const lane of layout.lanes) {
    for (const column of lane.columns) {
      const tickets = column.cards.flatMap((c) => (c.kind === 'ticket' ? [c.ref] : []))
      const at = tickets.findIndex((r) => sameTicket(r, ref))
      if (at === -1) continue
      return tickets[direction === 'up' ? at - 1 : at + 1] ?? null
    }
  }
  return null
}

export interface FeatureOption {
  key: string
  repoGroupKey: string
  repoName: string
  featureName: string
}

/** The features the feature filter offers: those of the selected repos, or of every repo. */
export function featureOptions(model: BoardModel, repoGroupKeys: string[]): FeatureOption[] {
  return scopeOf(model, { repoGroupKeys, featureKeys: [], search: '' }).groups.flatMap((g) =>
    [...g.features]
      .filter((f) => f.state !== 'empty')
      .sort(byName)
      .map((f) => ({ key: featureKey(g.repoGroupKey, f.name), repoGroupKey: g.repoGroupKey, repoName: g.repoName, featureName: f.name }))
  )
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

/** The repos the discovery line counts and its dialog lists; worktrees and repos already added by their main checkout only on request. */
export function notAddedRepos(repos: DiscoveredRepo[], showWorktrees: boolean): DiscoveredRepo[] {
  if (showWorktrees) return repos
  return repos.filter((r) => !r.mainAdded).map((r) => ({ ...r, worktrees: [] }))
}
