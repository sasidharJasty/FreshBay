import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function DonorsProfile() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Donor Profile</Text>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 18, fontWeight: '600' } });
