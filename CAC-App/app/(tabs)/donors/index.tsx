import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function DonorsDashboard() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Donors — Dashboard</Text>
      <Text style={styles.subtitle}>Overview of current donations (placeholder)</Text>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 20, fontWeight: '700' }, subtitle: { color: '#666' } });
