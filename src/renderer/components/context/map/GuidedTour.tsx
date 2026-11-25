import type { ContextReport } from '../../../../shared/context'
import type { Finding } from '../../../../shared/findings'
import { useContextStore } from '../../../state/contextStore'
import { KIND_EXPLANATIONS, KIND_TITLES } from '../../../state/mapCopy'
import { findingTarget, type TourStep } from '../../../state/mapTour'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { ListRow } from '../../ui/ListRow'
import { Pane } from '../../ui/Pane'
import { Panel } from '../../ui/Panel'
import { ScrollStack } from '../../ui/ScrollStack'
import { SectionLabel } from '../../ui/SectionLabel'
import { StepList } from '../../ui/StepList'
import { Toolbar } from '../../ui/Toolbar'

interface Props {
  steps: readonly TourStep[]
  report: ContextReport
  health: readonly Finding[]
}

/** The guided tour beside the context map: six steps, Back and Next, the current one's text and what it lights up. */
export function GuidedTour({ steps, report, health }: Props) {
  const current = useContextStore((s) => Math.min(s.tourStep, steps.length - 1))
  const go = (step: number): void => useContextStore.getState().setTourStep(step)
  const step = steps[current]
  return (
    <Pane label="Guided tour">
      <Toolbar
        compact
        actions={
          <span className="flex gap-1">
            <Button variant="ghost" disabled={current === 0} onClick={() => go(current - 1)}>
              Back
            </Button>
            <Button variant="secondary" disabled={current === steps.length - 1} onClick={() => go(current + 1)}>
              Next
            </Button>
          </span>
        }
      >
        <span className="text-xs text-muted">
          Step {current + 1} of {steps.length}
        </span>
      </Toolbar>
      <ScrollStack padded>
        <StepList label="Tour steps" titles={steps.map((s) => s.title)} current={current} onPick={go}>
          <StepBody step={step} report={report} health={health} />
        </StepList>
      </ScrollStack>
    </Pane>
  )
}

function StepBody({ step, report, health }: { step: TourStep; report: ContextReport; health: readonly Finding[] }) {
  return (
    <>
      {step.text.map((p) => (
        <p key={p} className="text-xs text-fg">
          {p}
        </p>
      ))}
      {step.kinds.map((kind) => (
        <section key={kind} aria-label={KIND_TITLES[kind]} className="flex flex-col gap-0.5">
          <SectionLabel as="h3">{KIND_TITLES[kind]}</SectionLabel>
          <p className="text-xs text-muted">{KIND_EXPLANATIONS[kind]}</p>
        </section>
      ))}
      {step.id === 'health' && <HealthFindings findings={step.findings} report={report} health={health} />}
    </>
  )
}

function HealthFindings({ findings, report, health }: { findings: readonly Finding[]; report: ContextReport; health: readonly Finding[] }) {
  const show = (id: string): void => {
    const store = useContextStore.getState()
    const target = findingTarget(report, health, store.mapExpanded, id)
    if (!target) return
    if (target.expand) store.toggleGroup(target.expand)
    store.selectBlock(target.blockId)
  }
  return (
    <Panel title="Findings" count={findings.length} empty="No findings.">
      <ul className="-mx-2 flex flex-col">
        {findings.map((f) => (
          <ListRow key={f.id} onClick={() => show(f.id)} tooltip={f.path}>
            <span className="min-w-0 flex-1 break-words">
              {f.severity === 'note' && <Badge tone="quiet">note</Badge>} {f.claim}
            </span>
          </ListRow>
        ))}
      </ul>
    </Panel>
  )
}
