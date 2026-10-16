import { useEffect, type RefObject } from 'react';
import type { WalkthroughControls } from './useWalkthrough';

/** Arrow keys, Home and End step through the walkthrough while focus is inside its region. */
export function useStepKeyboard(region: RefObject<HTMLElement | null>, controls: WalkthroughControls): void {
  useEffect(() => {
    const element = region.current;
    if (!element) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [role="tablist"]')) return;
      const actions: Record<string, () => void> = {
        ArrowRight: controls.next,
        ArrowLeft: controls.previous,
        Home: controls.first,
        End: controls.last,
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [region, controls]);
}
