import { useTheme, type ThemePreference } from '@/app/ThemeProvider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={preference}
      onValueChange={(next) => next && setPreference(next as ThemePreference)}
      aria-label="Colour theme"
      className="ml-2 hidden sm:flex"
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className="px-2 text-xs data-[state=on]:bg-ram-wash data-[state=on]:text-ink">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
