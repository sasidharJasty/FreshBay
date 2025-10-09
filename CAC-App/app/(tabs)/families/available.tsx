import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Alert } from 'react-native';
import api from '@/app/api';

const MOCK = [
  { id: '1', title: 'Bread & Pastries', distance: '0.6 mi', freshness: 'High', image: require('@/assets/images/icon.png') },
  { id: '2', title: 'Milk (2L)', distance: '1.2 mi', freshness: 'Medium', image: require('@/assets/images/icon.png') },
  { id: '3', title: 'Mixed Produce', distance: '0.9 mi', freshness: 'High', image: require('@/assets/images/icon.png') },
];

export default function FamiliesAvailable() {
  const [items, setItems] = useState(MOCK);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // In future call api.getAvailable()
  }, []);

  async function handleReserve(item: { id: string; title: string }) {
    setLoading(true);
    try {
      // try real API claim, fallback to mock response
      const res = await (api.claim ? api.claim(item.id) : Promise.resolve({ success: true, id: item.id }));
      if (res?.success) {
        Alert.alert('Reserved', `Pickup reserved for ${item.title}`);
      } else {
        Alert.alert('Error', 'Could not reserve item');
      }
    } catch (e) {
      Alert.alert('Network error', 'Could not contact server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Available Food</Text>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image source={item.image} style={styles.cardImage} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{item.distance} • Freshness: {item.freshness}</Text>
            </View>
            <TouchableOpacity style={styles.reserveButton} onPress={() => handleReserve(item)} disabled={loading}>
              <Text style={{ color: '#fff' }}>Reserve</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', padding: 12 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, marginHorizontal: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  cardImage: { width: 64, height: 64, borderRadius: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardMeta: { color: '#6B7280', marginTop: 4 },
  reserveButton: { backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
});
