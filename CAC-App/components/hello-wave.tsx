import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View, type ViewProps } from 'react-native';

export function HelloWave(props: ViewProps) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(rotation, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotation, {
          toValue: 0,
          duration: 400,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ]),
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['-10deg', '14deg'],
  });

  const { style, ...rest } = props;
  const AnimatedView = useRef(Animated.createAnimatedComponent(View)).current;
  return (
    <AnimatedView {...(rest as Animated.AnimatedProps<ViewProps>)} style={[{ transform: [{ rotate }] }, style]}>
      <Text style={{ fontSize: 28 }}>👋</Text>
    </AnimatedView>
  );
}
