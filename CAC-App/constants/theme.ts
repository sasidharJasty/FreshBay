import { Platform } from 'react-native';

export type ThemeMode = 'light' | 'dark';

type Palette = {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  card: string;
  success: string;
  warning: string;
  danger: string;
};

export const Colors: Record<ThemeMode, Palette> = {
  light: {
    text: '#11181C',
    background: '#FFFFFF',
    tint: '#2563EB',
    icon: '#687076',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#2563EB',
    card: '#F8FAFF',
    success: '#0F9D58',
    warning: '#F59E0B',
    danger: '#DC2626',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#4F9DFF',
    icon: '#9BA1A6',
    tabIconDefault: '#6F767F',
    tabIconSelected: '#4F9DFF',
    card: '#1E262F',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
  },
};

export const Fonts = {
  default:
    Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui', default: 'System' }) ??
    'System',
  rounded: Platform.select({ ios: 'SFProRounded-Semibold', default: 'System' }) ?? 'System',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', web: 'monospace', default: 'Courier' }) ??
    'Courier',
};

export function ensureTheme(mode?: string | null): ThemeMode {
  return mode === 'dark' ? 'dark' : 'light';
}
