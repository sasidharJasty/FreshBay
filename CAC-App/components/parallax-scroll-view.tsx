import React from 'react';
import { ImageBackground, ScrollView, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type HeaderColor = {
  light: string;
  dark: string;
};

type Props = React.PropsWithChildren<{
  headerBackgroundColor?: HeaderColor;
  headerImage?: React.ReactNode;
  headerHeight?: number;
  contentContainerStyle?: any;
}>;

export default function ParallaxScrollView({
  headerBackgroundColor = { light: '#E5E7EB', dark: '#111827' },
  headerImage,
  headerHeight = 240,
  children,
  contentContainerStyle,
}: Props) {
  const scheme = useColorScheme();
  const palette = Colors[scheme];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      <View style={[styles.header, { height: headerHeight }]}> 
        <ImageBackground
          style={styles.headerBackground}
          resizeMode="cover"
          source={{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2PU1dX+BQABVwGZHtfhNgAAAABJRU5ErkJggg==' }}
        >
          <View
            style={{ flex: 1, backgroundColor: scheme === 'dark' ? headerBackgroundColor.dark : headerBackgroundColor.light }}
          />
        </ImageBackground>
        <View style={styles.headerContent}>{headerImage}</View>
      </View>
      <View style={[styles.body, { backgroundColor: palette.background }]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 120,
  },
  header: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  headerBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 16,
  },
});
