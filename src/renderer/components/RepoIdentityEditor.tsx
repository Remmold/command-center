import { useCallback, useState } from 'react'
import { CaseUpper, ImagePlus, Pencil } from 'lucide-react'
import {
  BUILTIN_ICON_NAMES,
  MAX_REPO_IMAGE_LABEL,
  REPO_ACCENTS,
  repoDisplayName,
  type RepoAccent
} from '../../shared/repoIdentity'
import type { RepoGroupView } from '../../shared/repoGroups'
import { useRepoIdentitiesStore, useRepoIdentity } from '../state/repoIdentitiesStore'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { Popover, PopoverActions, PopoverNote, PopoverSection } from './ui/Popover'
import { SectionLabel } from './ui/SectionLabel'
import { Swatch, SwatchGrid } from './ui/SwatchGrid'
import { TextField } from './ui/TextField'
import { BUILTIN_ICONS } from './repoIconSet'

const DEFAULT_ACCENT: RepoAccent = 'blue'

export function RepoIdentityEditor({ group }: { group: RepoGroupView }) {
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
        revealOnHover
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
  const builtin = identity?.icon?.kind === 'builtin' ? identity.icon : null
  const [accent, setAccent] = useState<RepoAccent>(builtin?.accent ?? DEFAULT_ACCENT)
  const [error, setError] = useState<string | null>(null)
  const key = group.repoGroupKey

  const run = (change: Promise<string | null>) => {
    setError(null)
    void change.then(setError)
  }

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
        <PopoverActions>
          <Button
            variant="ghost"
            onClick={() => run(chooseImage(key))}
          >
            <ImagePlus size={11} strokeWidth={2.25} />
            Use image…
          </Button>
          {identity?.icon && (
            <Button variant="ghost" onClick={() => run(setIcon(key, undefined))}>
              <CaseUpper size={11} strokeWidth={2.25} />
              Use letter
            </Button>
          )}
        </PopoverActions>
        <PopoverNote>{error ?? `Your own icon: a PNG or SVG of up to ${MAX_REPO_IMAGE_LABEL}. Colours apply to built-in icons.`}</PopoverNote>
      </PopoverSection>
    </>
  )
}
