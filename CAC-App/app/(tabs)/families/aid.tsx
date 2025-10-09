import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function FamiliesAid() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aid & Benefits</Text>
      <Text style={styles.subtitle}>Local programs and help resources</Text>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 20, fontWeight: '700' }, subtitle: { color: '#666' } });
