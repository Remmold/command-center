import { useEffect } from 'react'
import { useBoardStore } from '../../state/boardStore'
import { NotAddedList } from '../board/NotAddedList'
import { ScanRootsForm } from '../board/ScanRootsForm'
import { Page, PageBody, PageGroup, PageHeader } from '../ui/Page'

export function BoardSettings() {
  const init = useBoardStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <Page label="Board">
      <PageHeader title="Board" description="Where the board looks for repos that have tickets." />
      <PageBody>
        <PageGroup title="Scan roots">
          <ScanRootsForm />
        </PageGroup>
        <PageGroup title="Repos with tickets, not added">
          <NotAddedList />
        </PageGroup>
      </PageBody>
    </Page>
  )
}
