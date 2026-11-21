import { letterColor, resolveRepoIcon, type RepoIconSpec } from '../../shared/repoIdentity'
import { useRepoDisplayName, useRepoIdentity } from '../state/repoIdentitiesStore'
import { BUILTIN_ICONS } from './repoIconSet'

interface Props {
  repoGroupKey: string
  repoName: string
  size?: 'sm' | 'md'
}

const SIZES = {
  sm: { box: 'h-4 w-4 text-[9px]', glyph: 11 },
  md: { box: 'h-5 w-5 text-[11px]', glyph: 13 }
} as const

export function RepoIcon({ repoGroupKey, repoName, size = 'md' }: Props) {
  const identity = useRepoIdentity(repoGroupKey)
  return <RepoIconView spec={resolveRepoIcon({ repoGroupKey, repoName, identity })} size={size} />
}

export function RepoName({ repoGroupKey, repoName }: { repoGroupKey: string; repoName: string }) {
  return <>{useRepoDisplayName(repoGroupKey, repoName)}</>
}

function RepoIconView({ spec, size = 'md' }: { spec: RepoIconSpec; size?: 'sm' | 'md' }) {
  const { box, glyph } = SIZES[size]
  const frame = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded font-semibold text-white ${box}`
  if (spec.kind === 'image') {
    // An <img>, never inline markup, so a custom SVG can't run script.
    return <img aria-hidden alt="" src={spec.src} draggable={false} className={`${frame} object-contain`} />
  }
  if (spec.kind === 'builtin') {
    const Icon = BUILTIN_ICONS[spec.name]
    return (
      <span aria-hidden className={frame} style={{ backgroundColor: spec.color }}>
        <Icon size={glyph} strokeWidth={2.25} />
      </span>
    )
  }
  return (
    <span aria-hidden className={frame} style={{ backgroundColor: letterColor(spec.hue) }}>
      {spec.letter}
    </span>
  )
}
