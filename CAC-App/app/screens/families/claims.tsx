import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#6C47FF';
const BACKGROUND = '#F8F9FF';

const reservedClaims = [
  {
    id: 'res-1',
    title: 'Family Meal Kit',
    pickup: 'Modesto Food Hub',
    readyAt: Date.now() + 60 * 60 * 1000, // 1 hour
    code: 'MK-4821',
  },
];

const activeClaims = [
  {
    id: 'act-1',
    title: 'Fresh Produce Pack',
    pickup: 'Ceres Pantry',
    readyAt: Date.now() - 15 * 60 * 1000,
    expiresAt: Date.now() + 45 * 60 * 1000,
    code: 'FP-9034',
  },
];

const historyClaims = [
  {
    id: 'hist-1',
    title: 'Bakery Variety Box',
    pickup: 'Westside Community Center',
    collectedAt: 'Sep 28, 3:10 PM',
    code: 'BK-1120',
  },
  {
    id: 'hist-2',
    title: 'Dairy Essentials',
    pickup: 'Central Valley Outreach',
    collectedAt: 'Sep 21, 1:45 PM',
    code: 'DA-7739',
  },
];

function formatCountdown(target: number) {
  const diff = Math.max(0, target - Date.now());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

function QRPlaceholder({ code }: { code: string }) {
  return (
    <View style={styles.qrBox}>
      <Text style={styles.qrCode}>{code}</Text>
      <Text style={styles.qrLabel}>Show this code at pickup</Text>
    </View>
  );
}

export default function FamiliesClaims() {
  const reserveCountdown = useMemo(() => formatCountdown(reservedClaims[0].readyAt), []);
  const readyCountdown = useMemo(() => formatCountdown(activeClaims[0].expiresAt), []);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Manage your pickups</Text>
      <Text style={styles.subtitle}>Keep an eye on timings and show your code when you arrive.</Text>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Reserved</Text>
          <TouchableOpacity>
            <Text style={styles.link}>Modify</Text>
          </TouchableOpacity>
        </View>
        {reservedClaims.map((claim) => (
          <View key={claim.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <StatusDot color="#FBBF24" />
              <Text style={styles.cardTitle}>{claim.title}</Text>
            </View>
            <Text style={styles.cardMeta}>{claim.pickup}</Text>
            <Text style={styles.cardDetail}>Ready in {reserveCountdown}</Text>
            <QRPlaceholder code={claim.code} />
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.secondaryAction}>
                <Ionicons name="calendar-outline" size={16} color={PRIMARY} />
                <Text style={styles.secondaryActionText}>Add to calendar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryAction}>
                <Ionicons name="share-outline" size={16} color={PRIMARY} />
                <Text style={styles.secondaryActionText}>Share pickup</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ready for pickup</Text>
          <TouchableOpacity>
            <Text style={styles.link}>Notify pantry</Text>
          </TouchableOpacity>
        </View>
        {activeClaims.map((claim) => (
          <View key={claim.id} style={[styles.card, styles.readyCard]}>
            <View style={styles.cardHeader}>
              <StatusDot color="#34D399" />
              <Text style={styles.cardTitle}>{claim.title}</Text>
            </View>
            <Text style={styles.cardMeta}>{claim.pickup}</Text>
            <Text style={styles.cardDetail}>Pickup window closes in {readyCountdown}</Text>
            <QRPlaceholder code={claim.code} />
            <TouchableOpacity style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>I’m on my way</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={[styles.section, { marginBottom: 36 }] }>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Past pickups</Text>
          <TouchableOpacity>
            <Text style={styles.link}>Export</Text>
          </TouchableOpacity>
        </View>
        {historyClaims.map((claim) => (
          <View key={claim.id} style={styles.historyCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyTitle}>{claim.title}</Text>
              <Text style={styles.historyMeta}>{claim.pickup}</Text>
              <Text style={styles.historyDate}>Collected {claim.collectedAt}</Text>
            </View>
            <View style={styles.historyCode}>
              <Text style={styles.historyCodeText}>{claim.code}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function StatusDot({ color }: { color: string }) {
  return <View style={[styles.statusDot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    backgroundColor: BACKGROUND,
  },
  screenTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { marginTop: 6, fontSize: 14, color: '#4B5563', marginBottom: 18 },
  section: { marginBottom: 22 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  link: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#101828',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  readyCard: { borderWidth: 1, borderColor: '#D6F5E7' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  cardMeta: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  cardDetail: { fontSize: 13, color: '#4B5563', marginBottom: 12 },
  qrBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C7D2FE',
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: '#F5F3FF',
  },
  qrCode: { fontSize: 20, fontWeight: '700', color: PRIMARY, letterSpacing: 2 },
  qrLabel: { marginTop: 6, fontSize: 12, color: '#6B7280' },
  cardActions: { flexDirection: 'row', gap: 14 },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryActionText: { color: PRIMARY, fontWeight: '600', fontSize: 12 },
  primaryButton: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  historyTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  historyMeta: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  historyDate: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  historyCode: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  historyCodeText: { color: PRIMARY, fontWeight: '600' },
});
