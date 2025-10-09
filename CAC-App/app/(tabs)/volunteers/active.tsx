import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function VolunteersActive() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Active Deliveries</Text>
      <Text style={styles.subtitle}>Status tracker for pickups/drops</Text>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 20, fontWeight: '700' }, subtitle: { color: '#666' } });
