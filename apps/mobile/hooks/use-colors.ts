import { useAccent } from '@/context/accent-context';
import { ACCENT_PALETTES, Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useColors() {
  const scheme = useColorScheme() ?? 'light';
  const { accentKey } = useAccent();
  const base = Colors[scheme];
  const accent = (ACCENT_PALETTES[accentKey] ?? ACCENT_PALETTES.lavender)[scheme];
  return {
    ...base,
    primary: accent.primary,
    tint: accent.primary,
    tabIconSelected: accent.primary,
    surfaceMuted: accent.surfaceMuted,
  };
}
