import { useRef, useState } from 'react'
import type { Model3dModel } from '../../../shared/model3d'
import { useModel3dStore } from '../../state/model3dStore'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { HeaderRow } from '../ui/HeaderRow'
import { ImagePreview } from '../ui/ImagePreview'
import { NoticeLine } from '../ui/NoticeLine'
import { Pane } from '../ui/Pane'
import { Panel } from '../ui/Panel'
import { PropertyList } from '../ui/PropertyList'
import { SegmentedControl } from '../ui/SegmentedControl'
import { StageCanvas, StageLayout, StageNotice } from '../ui/StageLayout'
import { ImageTile } from '../ui/Thumbnail'
import { Toolbar } from '../ui/Toolbar'
import { modelStatEntries } from './modelStats'
import { useModelScene, type Shading } from './useModelScene'

const SHADING: { value: Shading; label: string; title: string }[] = [
  { value: 'lit', label: 'Lit', title: 'Shade the model with the scene lights' },
  { value: 'unlit', label: 'Unlit', title: 'Show only the base colour map, without lights' }
]

/** The 3D view's right side: the open model with orbit, wireframe and lit or unlit, its stats and its contact sheet. */
export function ModelViewer() {
  const model = useModel3dStore((s) => s.model)
  const openError = useModel3dStore((s) => s.openError)
  const pickModel = useModel3dStore((s) => s.pickModel)
  const [wireframe, setWireframe] = useState(false)
  const [shading, setShading] = useState<Shading>('lit')

  return (
    <Pane label="Model viewer">
      <Toolbar
        actions={
          <span className="flex shrink-0 items-center gap-2">
            {model && (
              <>
                <Button variant="secondary" pressed={wireframe} onClick={() => setWireframe(!wireframe)} tooltip="Show the triangles as lines">
                  Wireframe
                </Button>
                <SegmentedControl label="Shading" options={SHADING} value={shading} onChange={setShading} />
              </>
            )}
            <Button variant="secondary" onClick={() => void pickModel()} tooltip="Open a .glb model from disk">
              Open model…
            </Button>
          </span>
        }
      >
        <HeaderRow title={model?.name ?? 'Viewer'} note={model?.path} />
      </Toolbar>
      {openError && (
        <NoticeLine tone="warning" strip>
          {openError}
        </NoticeLine>
      )}
      {model ? (
        <ModelStage key={model.url} model={model} wireframe={wireframe} shading={shading} />
      ) : (
        <StageLayout>
          <EmptyState>No model open.</EmptyState>
        </StageLayout>
      )}
    </Pane>
  )
}

function ModelStage({ model, wireframe, shading }: { model: Model3dModel; wireframe: boolean; shading: Shading }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useModelScene(canvas, model.url, { wireframe, shading })
  const entries = modelStatEntries(model.stats, scene.state === 'shown' ? scene.counted : null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetName = `${model.name}_sheet.png`

  return (
    <StageLayout
      asideLabel="Model details"
      aside={
        <>
          <Panel title="Stats" count={entries.length} empty={scene.state === 'failed' ? 'No stats.' : 'Counting…'}>
            <PropertyList label="Model stats" entries={entries} />
          </Panel>
          <Panel title="Contact sheet" count={model.sheetUrl ? 1 : 0} empty="No contact sheet.">
            <ImageTile src={model.sheetUrl} alt={sheetName} onOpen={() => setSheetOpen(true)} />
          </Panel>
          {sheetOpen && model.sheetUrl && <ImagePreview name={sheetName} src={model.sheetUrl} onClose={() => setSheetOpen(false)} />}
        </>
      }
    >
      <StageCanvas ref={canvas} label={`3D model ${model.name}`} state={scene.state} />
      {scene.state === 'loading' && <StageNotice>Loading {model.name}…</StageNotice>}
      {scene.state === 'failed' && <StageNotice tone="warning">Could not load {model.name}: {scene.error}</StageNotice>}
      {scene.state === 'shown' && !scene.webgl && <StageNotice tone="warning">WebGL is not available, so the model cannot be drawn; its stats are counted.</StageNotice>}
    </StageLayout>
  )
}
