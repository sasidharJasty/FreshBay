import React, { useCallback } from 'react';
import { Linking, Pressable, Text, type PressableProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ExternalLinkProps = PressableProps & {
  href: string;
  children: React.ReactNode;
};

export function ExternalLink({ href, children, style, ...rest }: ExternalLinkProps) {
  const scheme = useColorScheme();
  const palette = Colors[scheme];

  const handlePress = useCallback(async () => {
    try {
      const supported = await Linking.canOpenURL(href);
      if (supported) {
        await Linking.openURL(href);
      } else {
        console.warn('Cannot open link', href);
      }
    } catch (error) {
      console.warn('Failed to open external link', error);
    }
  }, [href]);

  return (
    <Pressable onPress={handlePress} style={style} {...rest}>
      <Text style={{ color: palette.tint, fontWeight: '600' }}>{children}</Text>
    </Pressable>
  );
}
