import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getFamiliesAvailable, reserveDonation } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { FoodMap } from '@/components/food-map';

const PRIMARY = '#6C47FF';

type Category = { value: string; label: string };
type InventoryDonation = {
  id: string | number;
  title: string;
  donor_name?: string;
  freshness_notes?: string;
  distance_miles?: number | string;
  quantity?: number;
  available_from?: string;
  available_until?: string;
  status_display?: string;
  category?: string;
  pickup_address?: string | null;
  pickup_latitude?: number | string | null;
  pickup_longitude?: number | string | null;
  zone?: {
    latitude?: number | string | null;
    longitude?: number | string | null;
  } | null;
};

type ZoneSummary = {
  id?: string | number;
  name?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  level_display?: string;
};

export default function FamiliesAvailable() {
  const { token } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const styles = useMemo(() => createStyles(palette, colorScheme as 'light' | 'dark'), [palette, colorScheme]);

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [liveInventory, setLiveInventory] = useState<InventoryDonation[]>([]);
  const [predictedInventory, setPredictedInventory] = useState<InventoryDonation[]>([]);
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [focusedDonation, setFocusedDonation] = useState<InventoryDonation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservingId, setReservingId] = useState<string | number | null>(null);

  const mapHeight = useMemo(() => {
    const windowHeight = Dimensions.get('window').height;
    return Math.max(320, windowHeight - 220);
  }, []);

  const hydrateInventory = useCallback((payload: any) => {
    if (!payload) return;
    setCategories(payload?.categories || []);
    setLiveInventory(payload?.live_inventory || []);
    setPredictedInventory(payload?.predicted_inventory || []);
    setZones(payload?.zones || []);
  }, []);

  useEffect(() => {
    if (!token) return;
    let isActive = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getFamiliesAvailable(token, selectedCategory);
        if (!isActive) return;
        hydrateInventory(res);
        setError(null);
      } catch (err: any) {
        if (!isActive) return;
        setError(err?.message || 'Unable to load inventory.');
      } finally {
        if (isActive) setLoading(false);
      }
    };
    load();
    return () => {
      isActive = false;
    };
  }, [token, selectedCategory, hydrateInventory]);

  useEffect(() => {
    if (viewMode !== 'map') {
      setFocusedDonation(null);
    }
  }, [viewMode]);

  const filters = (
    <View style={styles.filtersWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {(categories.length ? categories : [{ value: 'all', label: 'All' }]).map((cat) => (
          <TouchableOpacity
            key={cat.value}
            style={[styles.filterChip, selectedCategory === cat.value && styles.filterChipActive]}
            onPress={() => setSelectedCategory(cat.value)}
            activeOpacity={0.85}
          >
            <Text
              style={[styles.filterText, selectedCategory === cat.value && styles.filterTextActive]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.titleColumn}>
        <Text style={styles.screenTitle}>Grocery-style pickup</Text>
        <Text style={styles.subtitle}>Reserve items now or set alerts for upcoming donations.</Text>
      </View>
      <View style={styles.toggleCard}>
        <Ionicons name="map-outline" size={18} color={PRIMARY} />
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Map view</Text>
          <Text style={styles.toggleHelper}>
            {viewMode === 'map' ? 'Showing interactive map' : 'Switch to explore on map'}
          </Text>
        </View>
        <Switch
          value={viewMode === 'map'}
          onValueChange={(value) => setViewMode(value ? 'map' : 'list')}
          trackColor={{ false: colorScheme === 'dark' ? '#3F3F46' : '#CBD5FF', true: '#B5A8FF' }}
          thumbColor={viewMode === 'map' ? PRIMARY : colorScheme === 'dark' ? '#F8FAFC' : '#FFFFFF'}
        />
      </View>
    </View>
  );

  const loader = loading ? (
    <View style={styles.loadingRow}>
      <ActivityIndicator color={PRIMARY} />
      <Text style={styles.loadingText}>Loading inventory…</Text>
    </View>
  ) : null;

  const errorBanner = error && !loading ? (
    <View style={styles.errorBanner}>
      <Ionicons name="warning-outline" size={18} color={PRIMARY} />
      <Text style={styles.errorText}>{error}</Text>
    </View>
  ) : null;

  const handleReserve = useCallback(
    async (donation: InventoryDonation) => {
      if (!token || !donation?.id) return;
      setReservingId(donation.id);
      try {
        const claim = await reserveDonation(token, donation.id);
        const res = await getFamiliesAvailable(token, selectedCategory);
        hydrateInventory(res);
        setFocusedDonation(null);
        Alert.alert(
          'Pickup reserved',
          claim?.verification_code
            ? `Show code ${claim.verification_code} when you arrive.`
            : 'You can view this reservation from the My Claims tab.',
        );
      } catch (err: any) {
        const message = err?.body?.error || err?.message || 'Unable to reserve this donation right now.';
        Alert.alert('Reservation failed', message);
      } finally {
        setReservingId(null);
      }
    },
    [hydrateInventory, selectedCategory, token],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {viewMode === 'map' ? (
        <View style={styles.mapScreen}>
          {header}
          {loader}
          {errorBanner}
          {filters}
          <View style={styles.mapWrapper}>
            <FoodMap
              donations={liveInventory as any[]}
              zones={zones as any[]}
              height={mapHeight}
              onSelectDonation={setFocusedDonation}
            />
          </View>
          {focusedDonation ? (
            <View style={styles.mapHighlight}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mapHighlightTitle}>{focusedDonation.title}</Text>
                <Text style={styles.mapHighlightMeta}>
                  {focusedDonation.donor_name || 'Community partner'} • {formatDistance(focusedDonation.distance_miles)}
                </Text>
                <Text style={styles.mapHighlightMeta}>
                  {focusedDonation.freshness_notes || focusedDonation.status_display || 'Ready for pickup'}
                </Text>
              </View>
              <View style={styles.mapHighlightActions}>
                <TouchableOpacity
                  style={[styles.mapReserveButton, reservingId === focusedDonation.id && styles.mapReserveBusy]}
                  onPress={() => handleReserve(focusedDonation)}
                  activeOpacity={0.85}
                  disabled={!!reservingId && reservingId !== focusedDonation.id}
                >
                  {reservingId === focusedDonation.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.mapReserveText}>Reserve</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mapDismissButton}
                  onPress={() => setFocusedDonation(null)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="close" size={16} color={PRIMARY} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={styles.mapHint}>Tap a pin to preview pickup details.</Text>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {header}
          {loader}
          {errorBanner}
          {filters}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available now</Text>
              <TouchableOpacity onPress={() => setViewMode('map')} activeOpacity={0.85}>
                <Text style={styles.link}>Open map</Text>
              </TouchableOpacity>
            </View>

            {liveInventory.length === 0 && !loading ? (
              <Text style={styles.emptyText}>No items available right now. Check back soon!</Text>
            ) : (
              liveInventory.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="basket-outline" size={20} color={PRIMARY} />
                    <Text style={styles.cardTitle}>{item.title}</Text>
                  </View>
                  <Text style={styles.cardMeta}>{item.donor_name || 'Community partner'}</Text>
                  <Text style={styles.cardDetail}>{item.freshness_notes || item.status_display || 'Ready for pickup'}</Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.badge}>{formatDistance(item.distance_miles)}</Text>
                    <Text style={styles.badge}>{formatSlots(item.quantity)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.reserveButton, reservingId === item.id && styles.reserveButtonBusy]}
                    activeOpacity={0.85}
                    onPress={() => handleReserve(item)}
                    disabled={!!reservingId && reservingId !== item.id}
                  >
                    {reservingId === item.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.reserveText}>Reserve pickup</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Coming soon (AI predictions)</Text>
              <TouchableOpacity activeOpacity={0.85}>
                <Text style={styles.link}>Set alerts</Text>
              </TouchableOpacity>
            </View>

            {predictedInventory.length === 0 && !loading ? (
              <Text style={styles.emptyText}>No predicted donations right now.</Text>
            ) : (
              predictedInventory.map((item) => (
                <View key={item.id} style={styles.predictionCard}>
                  <View style={styles.predictionContent}>
                    <View style={styles.predictionBadge}>
                      <Ionicons name="sparkles-outline" size={18} color={PRIMARY} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.predictionTitle}>{item.title}</Text>
                      <Text style={styles.predictionMeta}>{item.donor_name || 'Community partner'}</Text>
                    </View>
                    <Text style={styles.predictionEta}>{formatEta(item.available_from)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>Need delivery? Request volunteer support</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

type Palette = typeof Colors.light;

const createStyles = (palette: Palette, mode: 'light' | 'dark') => {
  const surface = mode === 'dark' ? '#1F2430' : '#FFFFFF';
  const surfaceMuted = mode === 'dark' ? '#262D3C' : '#EEF2FF';
  const border = mode === 'dark' ? '#31384A' : '#E5E7EB';
  const textSecondary = mode === 'dark' ? '#B3BCD6' : '#4B5563';
  const textMuted = mode === 'dark' ? '#94A3B8' : '#6B7280';
  const shadowColor = mode === 'dark' ? 'transparent' : '#101828';

  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.background },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: 48 },
    headerBlock: {
      paddingHorizontal: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      marginBottom: 16,
    },
    titleColumn: { flex: 1, gap: 4 },
    screenTitle: { fontSize: 24, fontWeight: '700', color: palette.text },
    subtitle: { marginTop: 6, fontSize: 14, color: textSecondary },
    toggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: surface,
      borderRadius: 16,
      padding: 12,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 3,
    },
    toggleLabel: { fontSize: 14, fontWeight: '600', color: palette.text },
    toggleHelper: { fontSize: 12, color: textMuted },
    filtersWrapper: { paddingLeft: 16, marginBottom: 16 },
    filterRow: { paddingRight: 16, gap: 10 },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: surfaceMuted,
    },
    filterChipActive: {
      backgroundColor: PRIMARY,
    },
    filterText: { color: textSecondary, fontWeight: '600' },
    filterTextActive: { color: '#fff' },
    loadingRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      backgroundColor: surfaceMuted,
      padding: 10,
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    loadingText: { color: mode === 'dark' ? '#C3D1FF' : '#3730A3', fontWeight: '600', fontSize: 13 },
    errorBanner: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      backgroundColor: mode === 'dark' ? '#3B1F24' : '#FDE8E8',
      padding: 10,
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    errorText: { flex: 1, color: mode === 'dark' ? '#FCA5A5' : '#B91C1C', fontSize: 13 },
    section: { paddingHorizontal: 16, marginBottom: 24 },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: palette.text },
    link: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
    emptyText: { fontSize: 13, color: textMuted, marginBottom: 12 },
    card: {
      backgroundColor: surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 3,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    cardTitle: { fontSize: 16, fontWeight: '600', color: palette.text },
    cardMeta: { fontSize: 13, color: textMuted, marginBottom: 6 },
    cardDetail: { fontSize: 13, color: textSecondary, marginBottom: 12 },
    cardFooter: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    badge: {
      backgroundColor: mode === 'dark' ? '#2F2F45' : '#EEF2FF',
      color: PRIMARY,
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
      justifyContent: 'center',
    },
    reserveButtonBusy: {
      opacity: 0.7,
    },
    reserveText: { color: '#fff', fontWeight: '600' },
    predictionCard: {
      backgroundColor: surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
    },
    predictionContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    predictionBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: mode === 'dark' ? '#2D2642' : '#F1ECFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    predictionTitle: { fontSize: 16, fontWeight: '600', color: palette.text },
    predictionMeta: { fontSize: 13, color: textMuted, marginTop: 2 },
    predictionEta: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
    secondaryButton: {
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: mode === 'dark' ? '#2E2A45' : '#EDE9FE',
    },
    secondaryText: { color: PRIMARY, fontWeight: '600' },
    mapScreen: {
      flex: 1,
      backgroundColor: palette.background,
      paddingBottom: 24,
    },
    mapWrapper: {
      flex: 1,
      marginHorizontal: 16,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
    },
    mapHighlight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 16,
      backgroundColor: surface,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 3,
    },
    mapHighlightTitle: { fontSize: 16, fontWeight: '600', color: palette.text },
    mapHighlightMeta: { fontSize: 13, color: textSecondary, marginTop: 2 },
    mapHighlightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    mapReserveButton: {
      backgroundColor: PRIMARY,
      borderRadius: 22,
      paddingVertical: 8,
      paddingHorizontal: 18,
      minWidth: 90,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mapReserveBusy: {
      opacity: 0.7,
    },
    mapReserveText: { color: '#fff', fontWeight: '600' },
    mapDismissButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: mode === 'dark' ? '#3B3F55' : '#D9D6FF',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: mode === 'dark' ? '#1F2430' : '#FFFFFF',
    },
    mapHint: {
      fontSize: 13,
      color: textMuted,
      marginHorizontal: 16,
      marginTop: 12,
    },
  });
};

function formatDistance(distance: number | string | undefined) {
  if (distance === undefined || distance === null) return 'Distance N/A';
  const numeric = Number(distance);
  if (Number.isNaN(numeric)) return `${distance}`;
  const precision = numeric >= 10 ? 0 : 1;
  return `${numeric.toFixed(precision)} mi`;
}

function formatSlots(quantity: number | undefined) {
  if (quantity === undefined || quantity === null) return 'Open slots';
  if (quantity === 1) return '1 slot left';
  return `${quantity} slots left`;
}

function formatEta(isoDate?: string) {
  if (!isoDate) return 'Timing TBD';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Timing TBD';
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const time = `${((hours + 11) % 12) + 1}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
  const isToday = isSameDay(date, new Date());
  return isToday ? `Arriving ${time}` : `${date.toLocaleDateString()} • ${time}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
