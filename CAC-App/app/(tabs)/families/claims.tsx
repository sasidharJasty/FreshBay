import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function FamiliesClaims() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Claims</Text>
      <Text style={styles.subtitle}>Reserved and past pickups</Text>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 20, fontWeight: '700' }, subtitle: { color: '#666' } });
