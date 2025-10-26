import React from 'react';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';

export type IconSymbolProps = {
  name: string;
  size?: number;
  color?: string;
};

export function IconSymbol({ name, size = 24, color }: IconSymbolProps) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={name as any} tintColor={color} style={{ width: size, height: size }} />;
  }
  const iconName = mapSymbolToIonicon(name);
  return <Ionicons name={iconName as any} size={size} color={color} />;
}

function mapSymbolToIonicon(symbolName: string): string {
  const mapping: Record<string, string> = {
    'house.fill': 'home-sharp',
    'cart.fill': 'cart-sharp',
    'cube.box.fill': 'cube-sharp',
    'heart.fill': 'heart',
    'person.crop.circle': 'person-circle',
    'camera.fill': 'camera',
    'chart.bar.fill': 'bar-chart',
    'leaf.fill': 'leaf',
    'map.fill': 'map',
    'bolt.fill': 'flash',
    'car.fill': 'car',
  };
  return mapping[symbolName] ?? symbolName;
}

export default IconSymbol;
