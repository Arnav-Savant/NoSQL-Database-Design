import { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import type { EngineLanguage } from '@/content/whole-database';
import { LanguageToggle } from './LanguageToggle';

interface CompareSwitchProps {
  primary: EngineLanguage;
  /** The second language on screen, or null when comparing is off. */
  compareWith: EngineLanguage | null;
  onChange: (language: EngineLanguage | null) => void;
}

/** Turns on a second code pane showing the same component in another language. */
export function CompareSwitch({ primary, compareWith, onChange }: CompareSwitchProps) {
  const id = useId();
  const fallback: EngineLanguage = primary === 'java' ? 'cpp' : 'java';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <Switch id={id} checked={compareWith !== null} onCheckedChange={(on) => onChange(on ? fallback : null)} className="shadow-none" />
        <label htmlFor={id} className="text-[14px]">
          Compare with another language
        </label>
      </div>
      {compareWith ? <LanguageToggle value={compareWith} onChange={onChange} label="Language to compare with" unavailable={primary} /> : null}
    </div>
  );
}
