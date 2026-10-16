import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ENGINE_LANGUAGES, WHOLE_DATABASE, type EngineLanguage } from '@/content/whole-database';

interface LanguageToggleProps {
  value: EngineLanguage;
  onChange: (language: EngineLanguage) => void;
  label: string;
  /** A language that can't be picked here, such as the one already on screen. */
  unavailable?: EngineLanguage;
}

export function LanguageToggle({ value, onChange, label, unavailable }: LanguageToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as EngineLanguage);
      }}
      aria-label={label}
      variant="outline"
      className="shadow-none"
    >
      {ENGINE_LANGUAGES.map((language) => (
        <ToggleGroupItem
          key={language}
          value={language}
          disabled={language === unavailable}
          className="px-3 text-[13.5px] shadow-none data-[state=on]:bg-ink data-[state=on]:text-paper"
        >
          {WHOLE_DATABASE[language].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
