import React, { useCallback } from 'react';
import { TouchableOpacity, type GestureResponderEvent, type TouchableOpacityProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

/** Minimal wrapper around the tab bar button to add haptic feedback. */
export function HapticTab({ onPress, onLongPress, ...rest }: BottomTabBarButtonProps) {
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      Haptics.selectionAsync().catch(() => {});
      onPress?.(event);
    },
    [onPress]
  );

  const handleLongPress = useCallback(
    (event: GestureResponderEvent) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onLongPress?.(event);
    },
    [onLongPress]
  );

  const touchableProps = rest as TouchableOpacityProps;

  return (
    <TouchableOpacity
      {...touchableProps}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={touchableProps.activeOpacity ?? 0.8}
    />
  );
}

export default HapticTab;
