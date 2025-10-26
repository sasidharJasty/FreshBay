import React from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type TextType =
  | 'default'
  | 'defaultSemiBold'
  | 'title'
  | 'subtitle'
  | 'link'
  | 'mono';

type Props = TextProps & { type?: TextType };

export function ThemedText({ style, type = 'default', ...rest }: Props) {
  const scheme = useColorScheme();
  const palette = Colors[scheme];
  const presetStyle = TEXT_STYLES[type] ?? TEXT_STYLES.default;

  return <Text style={[{ color: palette.text }, presetStyle, style]} {...rest} />;
}

const TEXT_STYLES = StyleSheet.create({
  default: {
    fontFamily: Fonts.default,
    fontSize: 16,
    lineHeight: 22,
  } satisfies TextStyle,
  defaultSemiBold: {
    fontFamily: Fonts.default,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as TextStyle['fontWeight'],
  } satisfies TextStyle,
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as TextStyle['fontWeight'],
  } satisfies TextStyle,
  subtitle: {
    fontFamily: Fonts.default,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600' as TextStyle['fontWeight'],
  } satisfies TextStyle,
  link: {
    fontFamily: Fonts.default,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as TextStyle['fontWeight'],
    textDecorationLine: 'underline',
  } satisfies TextStyle,
  mono: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    lineHeight: 20,
  } satisfies TextStyle,
}) satisfies Record<TextType, TextStyle>;
