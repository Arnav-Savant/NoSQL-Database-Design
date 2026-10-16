import { LayoutGroup } from 'motion/react';
import { useMemo } from 'react';
import type { MachineState } from '@/engine/model';
import type { Step } from '@/engine/trace';
import { Bus } from './Bus';
import { ComponentRenderer } from './ComponentRenderer';
import { MachineBand } from './MachineBand';
import { MachineHighlightContext } from './machineContext';

/** The cross-section every stage is drawn on: RAM above, disk below, the bus between them. */
export function Machine({ state, step, id }: { state: MachineState; step?: Step; id: string }) {
  const highlight = useMemo(
    () => ({ touched: new Set(step?.touched ?? []), focus: step?.focus, problem: step?.outcome === 'problem' }),
    [step],
  );
  return (
    <MachineHighlightContext.Provider value={highlight}>
      <LayoutGroup id={id}>
        <figure className="overflow-hidden rounded-[4px] border border-rule" aria-label="RAM and disk">
          <MachineBand location="ram" empty="Nothing in memory.">
            {state.ram.length > 0 ? state.ram.map((component) => <ComponentRenderer key={component.id} component={component} />) : null}
          </MachineBand>
          <Bus io={step?.io ?? []} stepKey={`${id}:${step?.index ?? 'static'}`} blockedWrites={state.blockedWrites} />
          <MachineBand location="disk" empty="Nothing on disk.">
            {state.disk.length > 0 ? state.disk.map((component) => <ComponentRenderer key={component.id} component={component} />) : null}
          </MachineBand>
        </figure>
      </LayoutGroup>
    </MachineHighlightContext.Provider>
  );
}
