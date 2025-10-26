import { useColorScheme as useNativeColorScheme } from 'react-native';

import { ensureTheme, type ThemeMode } from '@/constants/theme';

export function useColorScheme(): ThemeMode {
  const nativeScheme = useNativeColorScheme();
  return ensureTheme(nativeScheme);
}
