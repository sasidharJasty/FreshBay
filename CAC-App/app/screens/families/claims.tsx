import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getFamiliesClaims } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PRIMARY = '#6C47FF';
type Donation = {
  title?: string;
  donor_name?: string;
  zone?: { name?: string } | null;
  quantity?: number;
};

type Claim = {
  id: string | number;
  status: string;
  reserved_at?: string;
  pickup_window_start?: string | null;
  pickup_window_end?: string | null;
  verification_code?: string;
  collected_at?: string | null;
  donation?: Donation | null;
};

type ClaimsPayload = {
  reserved: Claim[];
  active: Claim[];
  history: Claim[];
};

export default function FamiliesClaims() {
  const { token } = useAuth();
  const [claims, setClaims] = useState<ClaimsPayload>({ reserved: [], active: [], history: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const styles = useMemo(() => createStyles(palette, colorScheme as 'light' | 'dark'), [palette, colorScheme]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
  const res = await getFamiliesClaims(token);
        if (active) {
          setClaims({
            reserved: res?.reserved || [],
            active: res?.active || [],
            history: res?.history || [],
          });
          setError(null);
        }
      } catch (err: any) {
        if (active) setError(err?.message || 'Unable to load claims');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [token]);

  const renderQR = (code: string) => (
    <View style={styles.qrBox}>
      <Text style={styles.qrCode}>{code}</Text>
      <Text style={styles.qrLabel}>Show this code at pickup</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
      <Text style={styles.screenTitle}>Manage your pickups</Text>
      <Text style={styles.subtitle}>Keep an eye on timings and show your code when you arrive.</Text>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={PRIMARY} />
          <Text style={styles.loadingText}>Loading your claims…</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={18} color={PRIMARY} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Reserved</Text>
          <TouchableOpacity>
            <Text style={styles.link}>Modify</Text>
          </TouchableOpacity>
        </View>
        {claims.reserved.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No reserved pickups right now.</Text>
        ) : (
          claims.reserved.map((claim) => (
            <View key={claim.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(claim.status) }]} />
                <Text style={styles.cardTitle}>{claim.donation?.title || 'Pickup'}</Text>
              </View>
              <Text style={styles.cardMeta}>{formatPickupLocation(claim)}</Text>
              <Text style={styles.cardDetail}>Pickup window starts {formatDateTime(claim.pickup_window_start)}</Text>
              {renderQR(claim.verification_code || 'Pending')}
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
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ready for pickup</Text>
          <TouchableOpacity>
            <Text style={styles.link}>Notify pantry</Text>
          </TouchableOpacity>
        </View>
        {claims.active.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No active pickups right now.</Text>
        ) : (
          claims.active.map((claim) => (
            <View key={claim.id} style={[styles.card, styles.readyCard]}>
              <View style={styles.cardHeader}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(claim.status) }]} />
                <Text style={styles.cardTitle}>{claim.donation?.title || 'Pickup ready'}</Text>
              </View>
              <Text style={styles.cardMeta}>{formatPickupLocation(claim)}</Text>
              <Text style={styles.cardDetail}>Pickup window {formatWindow(claim)}</Text>
              {renderQR(claim.verification_code || 'Pending')}
              <TouchableOpacity style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>I’m on my way</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={[styles.section, { marginBottom: 36 }] }>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Past pickups</Text>
          <TouchableOpacity>
            <Text style={styles.link}>Export</Text>
          </TouchableOpacity>
        </View>
        {claims.history.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No pickup history yet.</Text>
        ) : (
          claims.history.map((claim) => (
            <View key={claim.id} style={styles.historyCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle}>{claim.donation?.title || 'Donation'}</Text>
                <Text style={styles.historyMeta}>{formatPickupLocation(claim)}</Text>
                <Text style={styles.historyDate}>Collected {formatDateTime(claim.collected_at)}</Text>
              </View>
              <View style={styles.historyCode}>
                <Text style={styles.historyCodeText}>{claim.verification_code || 'N/A'}</Text>
              </View>
            </View>
          ))
        )}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const statusColorMap = {
  ready: '#34D399',
  collected: '#6366F1',
  cancelled: '#F87171',
  pending: '#FBBF24',
};

const getStatusColor = (status: string) =>
  statusColorMap[status as keyof typeof statusColorMap] || statusColorMap.pending;

const createStyles = (palette: typeof Colors.light, mode: 'light' | 'dark') => {
  const surface = mode === 'dark' ? '#1F2430' : '#FFFFFF';
  const surfaceAlt = mode === 'dark' ? '#252C3C' : '#EEF2FF';
  const successBorder = mode === 'dark' ? '#1F513E' : '#D6F5E7';
  const border = mode === 'dark' ? '#2F3545' : '#E5E7EB';
  const textSecondary = mode === 'dark' ? '#B3BCD6' : '#4B5563';
  const textMuted = mode === 'dark' ? '#94A3B8' : '#6B7280';
  const subtleSurface = mode === 'dark' ? '#1D2230' : '#EEF2FF';
  const errorBg = mode === 'dark' ? '#3B1F24' : '#FDE8E8';
  const errorText = mode === 'dark' ? '#FCA5A5' : '#B91C1C';
  const shadowColor = mode === 'dark' ? 'transparent' : '#101828';
  const shadowOpacity = mode === 'dark' ? 0 : 0.07;

  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.background },
    scrollView: { flex: 1 },
    container: {
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: 36,
      backgroundColor: palette.background,
    },
    screenTitle: { fontSize: 24, fontWeight: '700', color: palette.text },
    subtitle: { marginTop: 6, fontSize: 14, color: textSecondary, marginBottom: 18 },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: subtleSurface,
      padding: 12,
      borderRadius: 12,
      marginBottom: 14,
    },
    loadingText: { color: mode === 'dark' ? '#C3D1FF' : '#3730A3', fontWeight: '600', fontSize: 13 },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: errorBg,
      padding: 12,
      borderRadius: 12,
      marginBottom: 14,
    },
    errorText: { flex: 1, color: errorText, fontSize: 13 },
    section: { marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: palette.text },
    link: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
    emptyText: { fontSize: 13, color: textMuted },
    card: {
      backgroundColor: surface,
      borderRadius: 18,
      padding: 18,
      marginBottom: 12,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 2,
    },
    readyCard: { borderWidth: 1, borderColor: successBorder },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    statusDot: { width: 12, height: 12, borderRadius: 6 },
    cardTitle: { fontSize: 16, fontWeight: '600', color: palette.text },
    cardMeta: { fontSize: 13, color: textMuted, marginBottom: 4 },
    cardDetail: { fontSize: 13, color: textSecondary, marginBottom: 12 },
    qrBox: {
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: mode === 'dark' ? '#3F4D87' : '#C7D2FE',
      paddingVertical: 18,
      alignItems: 'center',
      marginBottom: 14,
      backgroundColor: mode === 'dark' ? '#1F2435' : '#F5F3FF',
    },
    qrCode: { fontSize: 20, fontWeight: '700', color: PRIMARY, letterSpacing: 2 },
    qrLabel: { marginTop: 6, fontSize: 12, color: textMuted },
    cardActions: { flexDirection: 'row', gap: 14 },
    secondaryAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: subtleSurface,
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
      backgroundColor: surface,
      padding: 16,
      borderRadius: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: border,
      gap: 12,
    },
    historyTitle: { fontSize: 15, fontWeight: '600', color: palette.text },
    historyMeta: { fontSize: 13, color: textMuted, marginTop: 4 },
    historyDate: { fontSize: 12, color: mode === 'dark' ? '#A3B5D1' : '#9CA3AF', marginTop: 4 },
    historyCode: {
      backgroundColor: surfaceAlt,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    historyCodeText: { color: PRIMARY, fontWeight: '600' },
  });
};

function formatPickupLocation(claim: Claim) {
  const zone = claim.donation?.zone?.name;
  if (zone) return zone;
  if (claim.donation?.donor_name) return claim.donation.donor_name;
  return 'Pickup location provided after confirmation';
}

function formatDateTime(iso?: string | null) {
  if (!iso) return 'soon';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'soon';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function formatWindow(claim: Claim) {
  const start = formatDateTime(claim.pickup_window_start);
  const end = formatDateTime(claim.pickup_window_end);
  if (!claim.pickup_window_start && !claim.pickup_window_end) return 'details coming soon';
  if (!claim.pickup_window_end) return `starts ${start}`;
  return `${start} – ${end}`;
}
