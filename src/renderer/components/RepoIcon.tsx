import { repoGroupHue } from '../../shared/repoGroups'

interface Props {
  repoGroupKey: string
  repoName: string
  size?: 'sm' | 'md'
}

const SIZES = {
  sm: 'h-4 w-4 text-[9px]',
  md: 'h-5 w-5 text-[11px]'
} as const

export function RepoIcon({ repoGroupKey, repoName, size = 'md' }: Props) {
  const letter = repoName.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded font-semibold text-white ${SIZES[size]}`}
      style={{ backgroundColor: `hsl(${repoGroupHue(repoGroupKey)} 55% 40%)` }}
    >
      {letter}
    </span>
  )
}
