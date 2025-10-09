import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function VolunteersProfile() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Volunteer Profile</Text>
      <Text style={styles.subtitle}>Driver verification and schedule</Text>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 20, fontWeight: '700' }, subtitle: { color: '#666' } });
