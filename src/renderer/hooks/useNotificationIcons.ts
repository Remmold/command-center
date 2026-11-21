import { useEffect, useRef } from 'react'
import { groupByRepo } from '../../shared/repoGroups'
import { resolveRepoIcon } from '../../shared/repoIdentity'
import { useRepoIdentitiesStore } from '../state/repoIdentitiesStore'
import { useWorkspacesStore } from '../state/workspacesStore'
import { drawRepoIconPng } from '../state/drawRepoIcon'

/** Keeps main supplied with each repo group's icon drawn as a PNG, redrawing only what changed. */
export function useNotificationIcons(): void {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const load = useRepoIdentitiesStore((s) => s.load)
  const sent = useRef(new Map<string, string>())

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    for (const group of groupByRepo(workspaces)) {
      const spec = resolveRepoIcon({ ...group, identity: identities[group.repoGroupKey] })
      const signature = JSON.stringify(spec)
      if (sent.current.get(group.repoGroupKey) === signature) continue
      sent.current.set(group.repoGroupKey, signature)
      drawRepoIconPng(spec)
        .then((png) => window.api.repoIdentities.setRendered(group.repoGroupKey, png))
        .catch((err) => {
          sent.current.delete(group.repoGroupKey)
          console.error('failed to draw repo icon for notifications', err)
        })
    }
  }, [workspaces, identities])
}
