import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function DonorsProfile() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Donor Profile</Text>
      <Text style={styles.subtitle}>Business info and settings</Text>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 20, fontWeight: '700' }, subtitle: { color: '#666' } });
