import { createContext, useContext } from 'react';
import type { Focus } from '@/engine/trace';

export interface MachineHighlight {
  touched: ReadonlySet<string>;
  focus: Focus | undefined;
  problem: boolean;
}

export const MachineHighlightContext = createContext<MachineHighlight>({ touched: new Set(), focus: undefined, problem: false });

export function useHighlight(componentId: string) {
  const { touched, focus, problem } = useContext(MachineHighlightContext);
  const isFocusComponent = focus?.componentId === componentId;
  return {
    isTouched: touched.has(componentId),
    problem,
    focus: isFocusComponent ? focus : undefined,
    isRecordFocused: (recordId: string) => isFocusComponent && (focus?.recordIds?.includes(recordId) ?? false),
  };
}
