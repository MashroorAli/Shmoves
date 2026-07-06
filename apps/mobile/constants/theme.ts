import { Platform } from 'react-native';

const tintColorLight = '#7C3AED';
const tintColorDark = '#A78BFA';

export type AccentKey = 'sage' | 'slate' | 'lavender' | 'blush' | 'rose' | 'mauve';

type AccentVariant = { primary: string; surfaceMuted: string };

export const ACCENT_PALETTES: Record<AccentKey, { label: string; light: AccentVariant; dark: AccentVariant }> = {
  sage: {
    label: 'Sage',
    light: { primary: '#5BBFA0', surfaceMuted: '#e8f8f4' },
    dark:  { primary: '#7DD4B8', surfaceMuted: '#1E2E28' },
  },
  slate: {
    label: 'Slate',
    light: { primary: '#7DAECF', surfaceMuted: '#e8f2fa' },
    dark:  { primary: '#99C4E0', surfaceMuted: '#1E2830' },
  },
  lavender: {
    label: 'Lavender',
    light: { primary: '#9B8EC4', surfaceMuted: '#f0edf8' },
    dark:  { primary: '#B5A8D8', surfaceMuted: '#26223A' },
  },
  blush: {
    label: 'Blush',
    light: { primary: '#F0A0B8', surfaceMuted: '#fdeef4' },
    dark:  { primary: '#F5BFCE', surfaceMuted: '#3A2430' },
  },
  rose: {
    label: 'Rose',
    light: { primary: '#F07AA0', surfaceMuted: '#fde8f1' },
    dark:  { primary: '#F59AB8', surfaceMuted: '#3A2030' },
  },
  mauve: {
    label: 'Mauve',
    light: { primary: '#B86BAD', surfaceMuted: '#f7edf6' },
    dark:  { primary: '#CC8EC2', surfaceMuted: '#30223A' },
  },
};

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    surface: '#fff',
    surfaceMuted: '#f5f0ff',
    border: '#ddd',
    primary: '#7C3AED',
    destructive: '#D12C2C',
    inputText: '#111',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    surface: '#1C1C1E',
    surfaceMuted: '#2C2C2E',
    border: '#3A3A3C',
    primary: '#A78BFA',
    destructive: '#FF453A',
    inputText: '#ECEDEE',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
