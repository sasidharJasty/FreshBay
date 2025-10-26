import React, { useCallback, useMemo, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemedText } from '@/components/themed-text';

export type CollapsibleProps = {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

export function Collapsible({ title, children, defaultOpen = false }: CollapsibleProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const [open, setOpen] = useState(defaultOpen);

  const styles = useMemo(() => createStyles(palette), [palette]);

  const toggle = useCallback(() => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setOpen((prev) => !prev);
  }, []);

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={toggle} accessibilityRole="button">
        <ThemedText type="defaultSemiBold" style={styles.title}>
          {title}
        </ThemedText>
        <Ionicons
          name={open ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={18}
          color={palette.icon}
        />
      </Pressable>
      {open ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const createStyles = (palette: (typeof Colors)['light']) =>
  StyleSheet.create({
    container: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.icon,
      backgroundColor: palette.card,
      marginTop: 16,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    title: {
      fontSize: 16,
    },
    content: {
      paddingHorizontal: 18,
      paddingBottom: 18,
      gap: 12,
    },
  });

export default Collapsible;
