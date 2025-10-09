import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';

export default function FamiliesHome() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Families — Home</Text>
      <Text style={styles.subtitle}>Live map, available near you, and notifications (placeholder)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#444' },
});
