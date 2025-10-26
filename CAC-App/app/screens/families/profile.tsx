import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getFamiliesProfile } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PRIMARY = '#6C47FF';

export default function FamiliesProfile() {
  const { token, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [impact, setImpact] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [privacyShare, setPrivacyShare] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const styles = useMemo(() => createStyles(palette, colorScheme as 'light' | 'dark'), [palette, colorScheme]);
  const trackColor = useMemo(
    () => ({
      false: colorScheme === 'dark' ? '#3D4456' : '#E5E7EB',
      true: colorScheme === 'dark' ? '#6C47FF' : '#C7B6FF',
    }),
    [colorScheme],
  );
  const thumbOff = colorScheme === 'dark' ? '#1F2430' : '#fff';

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
  await logout();
    } catch (err) {
      console.warn('Unable to log out', err);
    } finally {
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
  const res = await getFamiliesProfile(token);
        if (!mounted) return;
        setProfile(res?.profile || null);
        setImpact(res?.impact || null);
        setError(null);
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Unable to load profile');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [token]);

  const firstName = profile?.user?.first_name || profile?.user?.email?.split('@')[0] || 'Family member';
  const lastName = profile?.user?.last_name || '';
  const email = profile?.user?.email || 'email not set';
  const phone = profile?.phone_number || '(add phone)';
  const zip = profile?.zip_code ? `ZIP ${profile.zip_code}` : 'ZIP not set';
  const initials = useMemo(() => {
    const combine = `${firstName} ${lastName}`.trim();
    return combine
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'FM';
  }, [firstName, lastName]);

  const dietary = Array.isArray(profile?.dietary_preferences) ? profile.dietary_preferences : [];
  const householdSize = profile?.household_size || 1;

  const impactStats = [
    { label: 'Meals received', value: impact?.meals_received ? String(impact.meals_received) : '0' },
    {
      label: 'CO₂ saved',
      value: impact?.co2_saved_lbs ? `${impact.co2_saved_lbs} lbs` : '0 lbs',
    },
    {
      label: 'Volunteer hours exchanged',
      value: impact?.volunteer_hours ? `${impact.volunteer_hours} hrs` : '0 hrs',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
      <Text style={styles.screenTitle}>Your family profile</Text>
      <Text style={styles.subtitle}>Update household details so we can tailor pickups and benefits.</Text>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={PRIMARY} />
          <Text style={styles.loadingText}>Loading your profile…</Text>
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
          <Text style={styles.sectionTitle}>Household</Text>
          <TouchableOpacity>
            <Text style={styles.link}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.primaryName}>{`${firstName} ${lastName}`.trim()}</Text>
            <Text style={styles.primaryMeta}>Family size {householdSize} • {zip}</Text>
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={16} color={PRIMARY} />
              <Text style={styles.infoText}>{email}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color={PRIMARY} />
              <Text style={styles.infoText}>{phone}</Text>
            </View>
          </View>
        </View>
        <View style={styles.membersCard}>
          <View style={styles.memberRow}>
            <Ionicons name="people-outline" size={16} color={PRIMARY} />
            <Text style={styles.memberName}>Primary contact</Text>
            <Text style={styles.memberRole}>{`${firstName} ${lastName}`.trim()}</Text>
          </View>
          <Text style={styles.memberHint}>
            Add household member names from the profile settings once you’re ready.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Food preferences</Text>
        <View style={styles.preferenceWrap}>
          {(dietary.length ? dietary : ['Share your preferences']).map((pref: string, idx: number) => (
            <View key={`${pref}-${idx}`} style={styles.preferenceChip}>
              <Ionicons name="leaf-outline" size={14} color={PRIMARY} />
              <Text style={styles.preferenceText}>{pref}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Update dietary preferences</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Impact summary</Text>
        <View style={styles.impactGrid}>
          {impactStats.map((stat) => (
            <View key={stat.label} style={styles.impactCard}>
              <Text style={styles.impactValue}>{stat.value}</Text>
              <Text style={styles.impactLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.linkRow}>
          <Ionicons name="stats-chart-outline" size={16} color={PRIMARY} />
          <Text style={styles.link}>View detailed impact report</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { marginBottom: 24 }]}>
        <Text style={styles.sectionTitle}>Notifications & privacy</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Push notifications</Text>
            <Text style={styles.settingSubtitle}>Pickup reminders & new donation alerts</Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={setPushEnabled}
            trackColor={trackColor}
            ios_backgroundColor={trackColor.false}
            thumbColor={pushEnabled ? PRIMARY : thumbOff}
          />
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>SMS updates</Text>
            <Text style={styles.settingSubtitle}>Send texts when volunteer drivers are on route</Text>
          </View>
          <Switch
            value={smsEnabled}
            onValueChange={setSmsEnabled}
            trackColor={trackColor}
            ios_backgroundColor={trackColor.false}
            thumbColor={smsEnabled ? PRIMARY : thumbOff}
          />
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Share pickup history with partner agencies</Text>
            <Text style={styles.settingSubtitle}>Helps unlock more aid recommendations</Text>
          </View>
          <Switch
            value={privacyShare}
            onValueChange={setPrivacyShare}
            trackColor={trackColor}
            ios_backgroundColor={trackColor.false}
            thumbColor={privacyShare ? PRIMARY : thumbOff}
          />
        </View>
      </View>

      <View style={styles.logoutSection}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
          disabled={loggingOut}
        >
          {loggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.logoutText}>Log out</Text>}
        </TouchableOpacity>
        <Text style={styles.logoutCaption}>You will return to the sign-in screen.</Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: typeof Colors.light, mode: 'light' | 'dark') => {
  const surface = mode === 'dark' ? '#1F2430' : '#FFFFFF';
  const surfaceAlt = mode === 'dark' ? '#252C3C' : '#EEF2FF';
  const border = mode === 'dark' ? '#2F3545' : '#E5E7EB';
  const subtleSurface = mode === 'dark' ? '#1D2230' : '#EEF2FF';
  const avatarBg = mode === 'dark' ? '#2D214F' : '#EDE9FE';
  const textSecondary = mode === 'dark' ? '#B3BCD6' : '#4B5563';
  const textMuted = mode === 'dark' ? '#94A3B8' : '#6B7280';
  const errorBg = mode === 'dark' ? '#3B1F24' : '#FDE8E8';
  const errorText = mode === 'dark' ? '#FCA5A5' : '#B91C1C';
  const shadowColor = mode === 'dark' ? 'transparent' : '#101828';
  const shadowOpacity = mode === 'dark' ? 0 : 0.06;

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
    profileCard: {
      backgroundColor: surface,
      borderRadius: 18,
      padding: 18,
      flexDirection: 'row',
      gap: 14,
      marginBottom: 12,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 2,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: avatarBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: PRIMARY, fontWeight: '700', fontSize: 16 },
    primaryName: { fontSize: 17, fontWeight: '600', color: palette.text },
    primaryMeta: { fontSize: 13, color: textMuted, marginVertical: 4 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoText: { fontSize: 13, color: textSecondary },
    membersCard: {
      backgroundColor: surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: border,
      gap: 10,
    },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    memberName: { flex: 1, fontSize: 14, color: palette.text },
    memberRole: { fontSize: 12, color: textMuted },
    memberHint: { fontSize: 12, color: textMuted },
    preferenceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    preferenceChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: surfaceAlt,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    preferenceText: { color: PRIMARY, fontSize: 12, fontWeight: '600' },
    secondaryButton: {
      borderRadius: 12,
      backgroundColor: mode === 'dark' ? '#2D214F' : '#EDE9FE',
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryText: { color: PRIMARY, fontWeight: '600' },
    impactGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
    impactCard: {
      flex: 1,
      backgroundColor: surface,
      borderRadius: 16,
      paddingVertical: 18,
      alignItems: 'center',
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 2,
    },
    impactValue: { fontSize: 18, fontWeight: '700', color: PRIMARY },
    impactLabel: { fontSize: 12, color: textMuted, marginTop: 4 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    settingRow: {
      backgroundColor: surface,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      borderWidth: 1,
      borderColor: border,
    },
    settingInfo: { flex: 1, marginRight: 12 },
    settingTitle: { fontSize: 15, fontWeight: '600', color: palette.text },
    settingSubtitle: { fontSize: 12, color: textMuted, marginTop: 4 },
    logoutSection: {
      marginBottom: 40,
      alignItems: 'center',
      gap: 8,
    },
    logoutButton: {
      backgroundColor: '#DC2626',
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 24,
      minWidth: 200,
      alignItems: 'center',
      shadowColor: mode === 'dark' ? 'transparent' : '#0F172A',
      shadowOpacity: mode === 'dark' ? 0 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: mode === 'dark' ? 0 : 3,
    },
    logoutText: { color: '#fff', fontWeight: '600', fontSize: 16 },
    logoutCaption: { fontSize: 12, color: textMuted },
  });
};
