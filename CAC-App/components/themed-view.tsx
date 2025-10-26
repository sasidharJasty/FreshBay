import React from 'react';
import { View, type ViewProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function ThemedView({ style, ...rest }: ViewProps) {
  const scheme = useColorScheme();
  const palette = Colors[scheme];
  return <View style={[{ backgroundColor: palette.background }, style]} {...rest} />;
}
