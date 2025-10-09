import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#6C47FF';
const BACKGROUND = '#F8F9FF';

const categories = ['All', 'Produce', 'Dairy', 'Bread', 'Prepared', 'Pantry'];

const liveInventory = [
  {
    id: 'inv-1',
    title: 'Seasonal Veggie Box',
    donor: 'Modesto Farmers Collective',
    freshness: 'Harvested this morning',
    distance: '0.7 mi',
    category: 'Produce',
    slots: 18,
  },
  {
    id: 'inv-2',
    title: 'Low-fat Yogurt Packs',
    donor: 'Central Dairy Hub',
    freshness: 'Keep refrigerated',
    distance: '1.4 mi',
    category: 'Dairy',
    slots: 12,
  },
  {
    id: 'inv-3',
    title: 'Artisan Bread Loaves',
    donor: 'Turlock Community Bakery',
    freshness: 'Ready for pickup',
    distance: '2.0 mi',
    category: 'Bread',
    slots: 24,
  },
];

const predictedInventory = [
  {
    id: 'pred-1',
    title: 'Family Meal Kits',
    donor: 'Riverbend Grocers',
    eta: 'Arriving in 3 hours',
    category: 'Prepared',
  },
  {
    id: 'pred-2',
    title: 'Shelf-stable Staples',
    donor: 'Community Partners Outlet',
    eta: 'Tomorrow 9:00 AM',
    category: 'Pantry',
  },
  {
    id: 'pred-3',
    title: 'Local Farm CSA overflow',
    donor: 'Bear Creek CSA',
    eta: 'Tomorrow 4:30 PM',
    category: 'Produce',
  },
];

export default function FamiliesAvailable() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const filteredLive = useMemo(() => {
    if (selectedCategory === 'All') return liveInventory;
    return liveInventory.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  const filteredPredicted = useMemo(() => {
    if (selectedCategory === 'All') return predictedInventory;
    return predictedInventory.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Grocery-style pickup</Text>
      <Text style={styles.subtitle}>Reserve items now or set alerts for upcoming donations.</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text
              style={[styles.filterText, selectedCategory === cat && styles.filterTextActive]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available now</Text>
          <TouchableOpacity>
            <Text style={styles.link}>View map</Text>
          </TouchableOpacity>
        </View>

        {filteredLive.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="basket-outline" size={20} color={PRIMARY} />
              <Text style={styles.cardTitle}>{item.title}</Text>
            </View>
            <Text style={styles.cardMeta}>{item.donor}</Text>
            <Text style={styles.cardDetail}>{item.freshness}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.badge}>{item.distance}</Text>
              <Text style={styles.badge}>{item.slots} slots left</Text>
            </View>
            <TouchableOpacity style={styles.reserveButton}>
              <Text style={styles.reserveText}>Reserve pickup</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Coming soon (AI predictions)</Text>
          <TouchableOpacity>
            <Text style={styles.link}>Set alerts</Text>
          </TouchableOpacity>
        </View>

        {filteredPredicted.map((item) => (
          <View key={item.id} style={styles.predictionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={styles.predictionBadge}>
                <Ionicons name="sparkles-outline" size={18} color={PRIMARY} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.predictionTitle}>{item.title}</Text>
                <Text style={styles.predictionMeta}>{item.donor}</Text>
              </View>
              <Text style={styles.predictionEta}>{item.eta}</Text>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>Need delivery? Request volunteer support</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    backgroundColor: BACKGROUND,
  },
  screenTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { marginTop: 6, fontSize: 14, color: '#4B5563', marginBottom: 18 },
  filterRow: { gap: 10, paddingRight: 16 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E2E7FF',
  },
  filterChipActive: {
    backgroundColor: PRIMARY,
  },
  filterText: { color: '#384151', fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  section: { marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  link: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#101828',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  cardMeta: { fontSize: 13, color: '#6B7280', marginBottom: 6 },
  cardDetail: { fontSize: 13, color: '#4B5563', marginBottom: 12 },
  cardFooter: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  badge: {
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 12,
    overflow: 'hidden',
  },
  reserveButton: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  reserveText: { color: '#fff', fontWeight: '600' },
  predictionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E4E2FF',
  },
  predictionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  predictionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  predictionMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  predictionEta: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  secondaryButton: {
    marginTop: 24,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
  },
  secondaryText: { color: PRIMARY, fontWeight: '600' },
});
