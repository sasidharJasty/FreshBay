import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function VolunteersTasks() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Available Tasks</Text>
      <Text style={styles.subtitle}>Open pickups nearby</Text>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 20, fontWeight: '700' }, subtitle: { color: '#666' } });
