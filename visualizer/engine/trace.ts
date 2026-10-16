import type { MachineState } from './model';

export type IoKind =
  | 'ram-read'
  | 'ram-write'
  | 'disk-sequential-read'
  | 'disk-random-read'
  | 'disk-append'
  | 'disk-overwrite'
  | 'disk-create'
  | 'disk-delete';

export interface IoEvent {
  kind: IoKind;
  componentId: string;
  detail: string;
}

export interface Focus {
  componentId: string;
  recordIds?: string[];
  byteRange?: [number, number];
  bits?: number[];
  zeroBit?: number;
  blockIndex?: number;
}

export interface Step {
  index: number;
  title: string;
  narration: string;
  touched: string[];
  io: IoEvent[];
  focus?: Focus;
  snippet?: { id: string; line: number };
  outcome: 'ok' | 'problem';
  state: MachineState;
}

export type StepInput = Omit<Step, 'index' | 'state' | 'outcome' | 'io' | 'touched'> & {
  outcome?: Step['outcome'];
  io?: IoEvent[];
  touched?: string[];
};

/** Records a snapshot of the machine after every step, so stepping back is just an index change. */
export class TraceRecorder {
  readonly #steps: Step[] = [];
  readonly #snapshot: () => MachineState;

  constructor(snapshot: () => MachineState) {
    this.#snapshot = snapshot;
  }

  record(step: StepInput): void {
    this.#steps.push({
      ...step,
      io: step.io ?? [],
      touched: step.touched ?? (step.focus ? [step.focus.componentId] : []),
      outcome: step.outcome ?? 'ok',
      index: this.#steps.length,
      state: structuredClone(this.#snapshot()),
    });
  }

  get steps(): readonly Step[] {
    return this.#steps;
  }
}
