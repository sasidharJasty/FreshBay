import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#6C47FF';
const BACKGROUND = '#F8F9FF';

const availabilityZones = [
  {
    id: 'zone-1',
    title: 'Downtown Modesto',
    level: 'High availability',
    households: 120,
    color: '#34D399',
  },
  {
    id: 'zone-2',
    title: 'West Ceres',
    level: 'Moderate availability',
    households: 64,
    color: '#FBBF24',
  },
  {
    id: 'zone-3',
    title: 'Turlock South',
    level: 'Low availability',
    households: 28,
    color: '#F87171',
  },
];

const quickClaims = [
  { id: 'claim-1', title: 'Fresh Strawberries', distance: '0.8 mi', freshness: 'Harvested today' },
  { id: 'claim-2', title: 'Rice & Beans Pack', distance: '1.3 mi', freshness: 'Ready at 4:00 PM' },
  { id: 'claim-3', title: 'Whole Milk (1 gal)', distance: '2.1 mi', freshness: 'Keep refrigerated' },
];

const notifications = [
  {
    id: 'notif-1',
    message: 'Milk and rice will be available at 4:00 PM near Ceres Pantry.',
    type: 'upcoming',
    time: 'in 2 hrs',
  },
  {
    id: 'notif-2',
    message: 'Volunteer driver confirmed your pickup at Modesto Food Hub.',
    type: 'confirmed',
    time: 'just now',
  },
  {
    id: 'notif-3',
    message: 'Fresh produce arriving tomorrow morning at Southside Outreach.',
    type: 'info',
    time: 'tomorrow',
  },
];

const upcomingDonations = [
  {
    id: 'soon-1',
    donor: 'Riverbend Grocers',
    items: 'Organic kale & tomatoes',
    eta: 'Arriving 5:30 PM',
  },
  {
    id: 'soon-2',
    donor: 'Central Bakery',
    items: 'Whole wheat loaves',
    eta: 'Tomorrow 7:15 AM',
  },
  {
    id: 'soon-3',
    donor: 'Harvest Dairy Co.',
    items: 'Greek yogurt & eggs',
    eta: 'Tomorrow 11:00 AM',
  },
];

export default function FamiliesHome() {
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Welcome back, Maria</Text>
      <Text style={styles.subtitle}>Here’s what’s happening around the Central Valley today.</Text>

      <View style={styles.mapCard}>
        <View style={styles.mapHeader}>
          <Text style={styles.cardTitle}>Availability Map</Text>
          <View style={styles.legendRow}>
            <LegendPill color="#34D399" label="High" />
            <LegendPill color="#FBBF24" label="Moderate" />
            <LegendPill color="#F87171" label="Low" />
          </View>
        </View>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapLabel}>Central Valley — live view</Text>
          <View style={styles.mapOverlay}>
            {availabilityZones.map((zone) => (
              <View key={zone.id} style={[styles.zoneChip, { backgroundColor: zone.color + '22' }]}>                
                <View style={[styles.zoneDot, { backgroundColor: zone.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.zoneTitle}>{zone.title}</Text>
                  <Text style={styles.zoneMeta}>{zone.level} • {zone.households} households</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available near you</Text>
          <TouchableOpacity><Text style={styles.link}>View all</Text></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
          {quickClaims.map((item) => (
            <View key={item.id} style={styles.quickCard}>
              <View style={styles.quickHeader}>
                <Ionicons name="fast-food-outline" size={20} color={PRIMARY} />
                <Text style={styles.quickTitle}>{item.title}</Text>
              </View>
              <Text style={styles.quickMeta}>{item.distance} • {item.freshness}</Text>
              <TouchableOpacity style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Reserve</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Smart notifications for you</Text>
          <TouchableOpacity><Text style={styles.link}>Manage</Text></TouchableOpacity>
        </View>
        {notifications.map((note) => (
          <View key={note.id} style={styles.notificationCard}>
            <View style={[styles.notificationIcon, notificationIconColors[note.type]]}>
              <Ionicons name={notificationIcons[note.type]} size={18} color={PRIMARY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifText}>{note.message}</Text>
              <Text style={styles.notifTime}>{note.time}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.section, { marginBottom: 32 }]}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Coming soon</Text>
          <TouchableOpacity><Text style={styles.link}>Prediction details</Text></TouchableOpacity>
        </View>
        <FlatList
          data={upcomingDonations}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 16 }}
          renderItem={({ item }) => (
            <View style={styles.soonCard}>
              <Text style={styles.soonDonor}>{item.donor}</Text>
              <Text style={styles.soonItems}>{item.items}</Text>
              <View style={styles.soonFooter}>
                <Ionicons name="time-outline" size={16} color={PRIMARY} />
                <Text style={styles.soonEta}>{item.eta}</Text>
              </View>
            </View>
          )}
        />
      </View>
    </ScrollView>
  );
}

const notificationIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  upcoming: 'alert-circle-outline',
  confirmed: 'checkmark-circle-outline',
  info: 'information-circle-outline',
};

const notificationIconColors: Record<string, { backgroundColor: string }> = {
  upcoming: { backgroundColor: '#F3E8FF' },
  confirmed: { backgroundColor: '#EEF9F2' },
  info: { backgroundColor: '#E8F1FF' },
};

function LegendPill({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendPill}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 40,
    backgroundColor: BACKGROUND,
  },
  screenTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { marginTop: 6, fontSize: 15, color: '#4B5563', marginBottom: 20 },
  mapCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#101828',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    marginBottom: 20,
  },
  mapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
  legendRow: { flexDirection: 'row', gap: 10 },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4FF',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendLabel: { fontSize: 12, color: '#4B5563' },
  mapPlaceholder: {
    height: 200,
    borderRadius: 14,
    backgroundColor: '#D6E4FF',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  mapLabel: { position: 'absolute', top: 14, left: 16, color: '#1F2937', fontWeight: '600' },
  mapOverlay: { padding: 14, gap: 10 },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 10,
  },
  zoneDot: { width: 18, height: 18, borderRadius: 9 },
  zoneTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  zoneMeta: { fontSize: 12, color: '#4B5563' },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  link: { fontSize: 14, color: PRIMARY, fontWeight: '600' },
  quickCard: {
    width: 200,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  quickHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  quickTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  quickMeta: { color: '#4B5563', fontSize: 13, marginBottom: 12 },
  primaryButton: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  notificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifText: { fontSize: 14, color: '#1F2937', marginBottom: 4 },
  notifTime: { fontSize: 12, color: '#6B7280' },
  soonCard: {
    width: 220,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginRight: 14,
    justifyContent: 'space-between',
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  soonDonor: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 6 },
  soonItems: { fontSize: 13, color: '#4B5563', marginBottom: 12 },
  soonFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soonEta: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
});
