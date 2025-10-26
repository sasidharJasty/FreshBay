import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getFamiliesDashboard } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { FoodMap } from '@/components/food-map';
import { FoodInspectionPanel } from '@/components/food-inspection-panel';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PRIMARY = '#6C47FF';

type DashboardPayload = {
  zones: any[];
  quick_claims: any[];
  notifications: any[];
  coming_soon: any[];
};

type SoonDonation = {
  id: string | number;
  donor_name?: string;
  freshness_notes?: string;
  status_display?: string;
  available_from?: string;
};

export default function FamiliesHome() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardPayload>({ zones: [], quick_claims: [], notifications: [], coming_soon: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedDonation, setHighlightedDonation] = useState<any | null>(null);
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const isDarkMode = colorScheme === 'dark';
  const inspectionPalette = useMemo(
    () => ({ ...palette, secondaryText: isDarkMode ? '#B3BCD6' : '#4B5563' }),
    [palette, isDarkMode],
  );
  const inspectionCardStyle = useMemo(
    () => ({
      backgroundColor: isDarkMode ? '#1F2430' : '#FFFFFF',
      borderWidth: isDarkMode ? 1 : 0,
      borderColor: isDarkMode ? '#2F3545' : '#E5E7EB',
      shadowColor: isDarkMode ? 'transparent' : '#101828',
      shadowOpacity: isDarkMode ? 0 : 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: isDarkMode ? 0 : 3,
    }),
    [isDarkMode],
  );
  const styles = useMemo(() => createStyles(palette, colorScheme as 'light' | 'dark'), [palette, colorScheme]);

  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getFamiliesDashboard(token);
        if (isMounted) {
          setData(res);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Unable to load dashboard');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const availabilityZones = useMemo(() => data.zones || [], [data.zones]);
  const quickClaims = useMemo(() => data.quick_claims || [], [data.quick_claims]);
  const notifications = useMemo(() => data.notifications || [], [data.notifications]);
  const upcomingDonations = useMemo<SoonDonation[]>(() => (data.coming_soon || []) as SoonDonation[], [data.coming_soon]);

  const LegendPill = ({ color, label }: { color: string; label: string }) => (
    <View style={styles.legendPill}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Welcome back</Text>
        <Text style={styles.subtitle}>Here’s what’s happening around you today.</Text>

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.loadingText}>Fetching the latest updates…</Text>
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={18} color={PRIMARY} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.mapSection}>
          <View style={styles.mapHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Nearby food map</Text>
              <Text style={styles.mapSubtitle}>Tap a pin to preview what’s available right now.</Text>
            </View>
            <View style={styles.legendRow}>
              <LegendPill color="#34D399" label="High" />
              <LegendPill color="#FBBF24" label="Moderate" />
              <LegendPill color="#F87171" label="Low" />
            </View>
          </View>
          <FoodMap
            donations={quickClaims as any[]}
            zones={availabilityZones as any[]}
            height={280}
            onSelectDonation={setHighlightedDonation}
          />
        </View>

        <FoodInspectionPanel
          token={token}
          palette={inspectionPalette}
          mode="charity"
          accentColor={PRIMARY}
          style={[styles.aiSectionCard, inspectionCardStyle]}
        />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available near you</Text>
          <TouchableOpacity>
            <Text style={styles.link}>View full list</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 16, gap: 12 }}
        >
          {quickClaims.length === 0 && !loading ? (
            <View style={styles.quickCard}>
              <Text style={styles.quickTitle}>No donations available</Text>
              <Text style={styles.quickMeta}>Check back soon for more pickups.</Text>
            </View>
          ) : (
            quickClaims.slice(0, 5).map((item: any) => {
              const isActive = highlightedDonation?.id === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.88}
                  style={[styles.quickCard, isActive && styles.quickCardActive]}
                  onPress={() => setHighlightedDonation(item)}
                >
                  <View style={styles.quickHeader}>
                    <Ionicons name="fast-food-outline" size={20} color={PRIMARY} />
                    <Text style={styles.quickTitle}>{item.title}</Text>
                  </View>
                  <Text style={styles.quickMeta}>
                    {formatDistance(item.distance_miles)} • {item.freshness_notes || item.status_display}
                  </Text>
                  <View style={styles.quickFooterRow}>
                    {item.donor_name && <Text style={styles.quickDonor}>{item.donor_name}</Text>}
                    <Ionicons name="chevron-forward" size={16} color={PRIMARY} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Smart notifications for you</Text>
          <TouchableOpacity><Text style={styles.link}>Manage</Text></TouchableOpacity>
        </View>
        {notifications.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No notifications yet.</Text>
        ) : (
          notifications.map((note: any) => {
            const type = note.notification_type || 'info';
            const iconName = notificationIcons[type] || notificationIcons.info;
            const iconBg =
              notificationIconColors[type]?.[colorScheme as 'light' | 'dark'] ||
              (colorScheme === 'dark' ? '#1F3149' : '#E8F1FF');
            return (
              <TouchableOpacity key={note.id} style={styles.notificationCard} activeOpacity={0.9}>
                <View style={[styles.notificationIcon, { backgroundColor: iconBg }]}>
                  <Ionicons name={iconName} size={18} color={PRIMARY} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifText}>{note.message}</Text>
                  <Text style={styles.notifTime}>{formatRelativeTime(note.scheduled_for)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={PRIMARY} />
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={[styles.section, { marginBottom: 32 }]}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Coming soon</Text>
          <TouchableOpacity><Text style={styles.link}>Prediction details</Text></TouchableOpacity>
        </View>
        <FlatList<SoonDonation>
          data={upcomingDonations}
          keyExtractor={(item) => String(item.id)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 16, gap: 12 }}
          renderItem={({ item }) => (
            <View style={styles.soonCard}>
              <Text style={styles.soonDonor}>{item.donor_name}</Text>
              <Text style={styles.soonItems}>{item.freshness_notes || item.status_display}</Text>
              <View style={styles.soonFooter}>
                <Ionicons name="time-outline" size={16} color={PRIMARY} />
                <Text style={styles.soonEta}>{formatEta(item.available_from)}</Text>
              </View>
            </View>
          )}
        />
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const notificationIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  upcoming: 'alert-circle-outline',
  confirmed: 'checkmark-circle-outline',
  info: 'information-circle-outline',
};

const notificationIconColors: Record<string, { light: string; dark: string }> = {
  upcoming: { light: '#F3E8FF', dark: '#352850' },
  confirmed: { light: '#EEF9F2', dark: '#1F3A2C' },
  info: { light: '#E8F1FF', dark: '#1F3149' },
};

type Palette = typeof Colors.light;

const createStyles = (palette: Palette, mode: 'light' | 'dark') => {
  const surface = mode === 'dark' ? '#1F2430' : '#FFFFFF';
  const surfaceMuted = mode === 'dark' ? '#252C3C' : '#F3F4FF';
  const subtleSurface = mode === 'dark' ? '#1D2230' : '#EEF2FF';
  const border = mode === 'dark' ? '#2F3545' : '#E5E7EB';
  const textSecondary = mode === 'dark' ? '#B3BCD6' : '#4B5563';
  const textMuted = mode === 'dark' ? '#94A3B8' : '#6B7280';
  const shadowColor = mode === 'dark' ? 'transparent' : '#101828';
  const shadowOpacity = mode === 'dark' ? 0 : 0.08;

  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.background },
    scrollView: { flex: 1 },
    container: {
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: 40,
      backgroundColor: palette.background,
    },
    screenTitle: { fontSize: 24, fontWeight: '700', color: palette.text },
    subtitle: { marginTop: 6, fontSize: 15, color: textSecondary, marginBottom: 20 },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: subtleSurface,
      padding: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    loadingText: { color: mode === 'dark' ? '#C3D1FF' : '#3730A3', fontWeight: '600' },
    errorBanner: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      backgroundColor: mode === 'dark' ? '#3B1F24' : '#FDE8E8',
      padding: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    errorText: { color: mode === 'dark' ? '#FCA5A5' : '#B91C1C', flex: 1, fontSize: 13 },
    mapSection: {
      backgroundColor: surface,
      borderRadius: 20,
      padding: 16,
      marginBottom: 20,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 3,
      gap: 12,
    },
    aiSectionCard: {
      marginBottom: 24,
      borderRadius: 20,
      padding: 18,
      gap: 16,
    },
    mapHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    mapSubtitle: {
      fontSize: 13,
      color: textMuted,
      marginTop: 4,
    },
    legendRow: { flexDirection: 'row', gap: 10 },
    legendPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: surfaceMuted,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    legendLabel: { fontSize: 12, color: textSecondary },
    emptyText: { fontSize: 13, color: textMuted },
    section: { marginBottom: 24 },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: palette.text },
    link: { fontSize: 14, color: PRIMARY, fontWeight: '600' },
    quickCard: {
      width: 200,
      backgroundColor: surface,
      borderRadius: 16,
      padding: 16,
      marginRight: 14,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 2,
    },
    quickCardActive: {
      borderWidth: 2,
      borderColor: PRIMARY,
    },
    quickHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    quickTitle: { fontSize: 16, fontWeight: '600', color: palette.text },
    quickMeta: { color: textSecondary, fontSize: 13, marginBottom: 12 },
    quickFooterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    quickDonor: { fontSize: 12, color: textMuted },
    notificationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: surface,
      padding: 14,
      borderRadius: 14,
      marginBottom: 12,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 2,
    },
    notificationIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifText: { fontSize: 14, color: palette.text, marginBottom: 4 },
    notifTime: { fontSize: 12, color: textMuted },
    soonCard: {
      width: 220,
      padding: 16,
      backgroundColor: surface,
      borderRadius: 16,
      marginRight: 14,
      justifyContent: 'space-between',
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 2,
    },
    soonDonor: { fontSize: 15, fontWeight: '600', color: palette.text, marginBottom: 6 },
    soonItems: { fontSize: 13, color: textSecondary, marginBottom: 12 },
    soonFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    soonEta: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  });
};

function formatDistance(distance: number | string | null | undefined) {
  if (distance === null || distance === undefined) return 'Distance N/A';
  const numeric = Number(distance);
  if (Number.isNaN(numeric)) return `${distance}`;
  const precision = numeric >= 10 ? 0 : 1;
  return `${numeric.toFixed(precision)} mi`;
}

function formatEta(isoDate: string | null | undefined) {
  if (!isoDate) return 'Timing TBD';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Timing TBD';
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const time = `${((hours + 11) % 12) + 1}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
  const isToday = sameDay(date, new Date());
  return isToday ? `Arriving ${time}` : `${date.toLocaleDateString()} • ${time}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatRelativeTime(isoDate: string | null | undefined) {
  if (!isoDate) return 'Just now';
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return 'Just now';
  const diffMs = target.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 1) return 'Just now';
  if (Math.abs(diffMinutes) < 60) {
    return diffMinutes > 0 ? `in ${diffMinutes} min` : `${Math.abs(diffMinutes)} min ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return diffHours > 0 ? `in ${diffHours} hrs` : `${Math.abs(diffHours)} hrs ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return diffDays > 0 ? `in ${diffDays} days` : `${Math.abs(diffDays)} days ago`;
}
