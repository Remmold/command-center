import { useCallback, useState } from 'react'
import { CaseUpper, ImagePlus, Pencil, RefreshCw, Sparkles } from 'lucide-react'
import {
  BUILTIN_ICON_NAMES,
  MAX_REPO_IMAGE_LABEL,
  REPO_ACCENTS,
  iconOrigin,
  repoDisplayName,
  type RepoAccent,
  type RepoIdentityView
} from '../../shared/repoIdentity'
import type { RepoGroupView } from '../../shared/repoGroups'
import { useRepoIdentitiesStore, useRepoIdentity } from '../state/repoIdentitiesStore'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { Popover, PopoverActions, PopoverNote, PopoverSection } from './ui/Popover'
import { SectionLabel } from './ui/SectionLabel'
import { Swatch, SwatchGrid, SwatchImage } from './ui/SwatchGrid'
import { TextField } from './ui/TextField'
import { BUILTIN_ICONS } from './repoIconSet'

const DEFAULT_ACCENT: RepoAccent = 'blue'

export function RepoIdentityEditor({ group, revealOnHover = true }: { group: RepoGroupView; revealOnHover?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <IconButton
        ref={setAnchor}
        onClick={() => setOpen(!open)}
        label={`edit icon and name of ${group.repoName}`}
        tooltip="edit repo icon and name"
        revealOnHover={revealOnHover}
        pinned={open}
      >
        <Pencil size={11} strokeWidth={2.25} />
      </IconButton>
      <Popover open={open} onClose={close} anchor={anchor} label="repo icon">
        <IdentityForm group={group} />
      </Popover>
    </>
  )
}

function IdentityForm({ group }: { group: RepoGroupView }) {
  const identity = useRepoIdentity(group.repoGroupKey)
  const setDisplayName = useRepoIdentitiesStore((s) => s.setDisplayName)
  const setIcon = useRepoIdentitiesStore((s) => s.setIcon)
  const chooseImage = useRepoIdentitiesStore((s) => s.chooseImage)
  const detect = useRepoIdentitiesStore((s) => s.detect)
  const [searching, setSearching] = useState(false)
  const builtin = identity?.icon?.kind === 'builtin' ? identity.icon : null
  const [accent, setAccent] = useState<RepoAccent>(builtin?.accent ?? DEFAULT_ACCENT)
  const [error, setError] = useState<string | null>(null)
  const key = group.repoGroupKey

  const run = (change: Promise<string | null>) => {
    setError(null)
    void change.then(setError)
  }

  const detectAgain = () => {
    setSearching(true)
    run(detect(key).finally(() => setSearching(false)))
  }

  const found = identity?.found

  const pickAccent = (next: RepoAccent) => {
    setAccent(next)
    if (builtin) run(setIcon(key, { ...builtin, accent: next }))
  }

  return (
    <>
      <PopoverSection>
        <SectionLabel>display name</SectionLabel>
        <TextField
          label="display name"
          placeholder={repoDisplayName(group.repoName, identity)}
          onSubmit={(name) => run(setDisplayName(key, name))}
        />
        {identity?.displayName && (
          <PopoverActions>
            <Button variant="ghost" onClick={() => run(setDisplayName(key, ''))}>
              Use folder name
            </Button>
          </PopoverActions>
        )}
      </PopoverSection>
      <PopoverSection>
        <SectionLabel>accent colour</SectionLabel>
        <SwatchGrid label="accent colour">
          {(Object.keys(REPO_ACCENTS) as RepoAccent[]).map((a) => (
            <Swatch key={a} label={a} fill={REPO_ACCENTS[a]} selected={a === accent} onClick={() => pickAccent(a)} />
          ))}
        </SwatchGrid>
      </PopoverSection>
      <PopoverSection>
        <SectionLabel>icon</SectionLabel>
        <SwatchGrid label="icon">
          {BUILTIN_ICON_NAMES.map((name) => {
            const Icon = BUILTIN_ICONS[name]
            return (
              <Swatch
                key={name}
                label={name}
                selected={builtin?.name === name}
                onClick={() => run(setIcon(key, { kind: 'builtin', name, accent }))}
              >
                <Icon size={13} strokeWidth={2} />
              </Swatch>
            )
          })}
        </SwatchGrid>
      </PopoverSection>
      <PopoverSection>
        <SectionLabel>found in this repo</SectionLabel>
        <FoundIcons identity={identity} onPick={(file) => run(setIcon(key, { kind: 'found', file }))} />
        <PopoverNote>{inUseNote(identity, searching)}</PopoverNote>
      </PopoverSection>
      <PopoverSection>
        <PopoverActions>
          <Button variant="ghost" onClick={() => run(chooseImage(key))}>
            <ImagePlus size={11} strokeWidth={2.25} />
            Use image…
          </Button>
          {identity?.icon?.kind !== 'letter' && (
            <Button variant="ghost" onClick={() => run(setIcon(key, { kind: 'letter' }))}>
              <CaseUpper size={11} strokeWidth={2.25} />
              Use letter
            </Button>
          )}
          {identity?.icon && !!found?.length && (
            <Button variant="ghost" onClick={() => run(setIcon(key, undefined))} tooltip="Use the best icon found in this repo">
              <Sparkles size={11} strokeWidth={2.25} />
              Use automatic
            </Button>
          )}
          <Button variant="ghost" onClick={detectAgain} disabled={searching} tooltip="Search this repo for icons again">
            <RefreshCw size={11} strokeWidth={2.25} />
            Detect again
          </Button>
        </PopoverActions>
        <PopoverNote>{error ?? `Your own icon: a PNG or SVG of up to ${MAX_REPO_IMAGE_LABEL}. Colours apply to built-in icons.`}</PopoverNote>
      </PopoverSection>
    </>
  )
}

const pickedFile = (identity: RepoIdentityView | undefined): string | undefined =>
  identity?.icon?.kind === 'image' ? identity.icon.file : undefined

function FoundIcons({ identity, onPick }: { identity: RepoIdentityView | undefined; onPick: (file: string) => void }) {
  const found = identity?.found
  if (!found) return <PopoverNote>Not searched yet.</PopoverNote>
  if (found.length === 0) return <PopoverNote>No icon found in this repo.</PopoverNote>
  const automatic = iconOrigin(identity) === 'automatic'
  const picked = pickedFile(identity)
  return (
    <SwatchGrid label="found in this repo">
      {found.map((f, i) => {
        const mark = automatic && i === 0 ? 'automatic' : f.file === picked ? 'picked' : null
        return (
          <Swatch key={f.file} label={mark ? `${f.path} (${mark})` : f.path} selected={mark !== null} onClick={() => onPick(f.file)}>
            <SwatchImage src={f.url} />
          </Swatch>
        )
      })}
    </SwatchGrid>
  )
}

function inUseNote(identity: RepoIdentityView | undefined, searching: boolean): string {
  if (searching) return 'Searching this repo…'
  const icon = identity?.icon
  if (icon?.kind === 'letter') return 'Picked: the letter.'
  if (icon) {
    const fromRepo = identity?.found?.find((f) => f.file === pickedFile(identity))
    return fromRepo ? `Picked: ${fromRepo.path}` : 'Picked: your own icon.'
  }
  const automatic = identity?.found?.[0]
  return automatic ? `Automatic: ${automatic.path}` : 'Automatic: the letter.'
}
