import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDonorProfile, updateDonorProfile } from '@/app/api';

type Palette = {
  text: string;
  background: string;
  tint: string;
  icon: string;
  secondaryText: string;
  card: string;
  border: string;
};

function formatDateLabel(date: Date | null) {
  if (!date) return 'Set date & time';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export default function DonorsProfile() {
  const { token, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [volunteersNeeded, setVolunteersNeeded] = useState('');
  const [pickupAt, setPickupAt] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const colorScheme = useColorScheme() ?? 'light';
  const palette: Palette = useMemo(() => {
    const base = Colors[colorScheme as 'light' | 'dark'];
    return {
      ...base,
      secondaryText: colorScheme === 'dark' ? '#A8B1CE' : '#475569',
      card: colorScheme === 'dark' ? '#1F2430' : '#F8FAFF',
      border: colorScheme === 'dark' ? '#2D3240' : '#E2E8F0',
    } as Palette;
  }, [colorScheme]);

  const styles = useMemo(() => createStyles(palette, colorScheme as 'light' | 'dark'), [palette, colorScheme]);
  const isDark = colorScheme === 'dark';
  const secondaryPill = isDark ? '#2E3344' : '#E2E8F0';
  const tertiaryPill = isDark ? '#38405A' : '#DBEAFE';

  const loadProfile = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getDonorProfile(token);
      setProfile(res);
      const volunteers = res?.operations?.volunteers_needed;
      setVolunteersNeeded(Number.isFinite(volunteers) ? String(volunteers) : '');
      setPickupAt(res?.operations?.next_pickup_at ? new Date(res.operations.next_pickup_at) : null);
    } catch (error) {
      console.warn('Failed to load donor profile', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleLogout = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
    } catch (error) {
      console.warn('Unable to log out', error);
    } finally {
      setBusy(false);
    }
  }, [busy, logout]);

  const handleDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (event.type === 'dismissed') {
        if (Platform.OS === 'android') {
          setShowDatePicker(false);
        }
        return;
      }

      if (selected) {
        setPickupAt(selected);
      }

      if (Platform.OS === 'android') {
        setShowDatePicker(false);
      }
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    try {
      await updateDonorProfile(token, {
        operations: {
          next_pickup_at: pickupAt ? pickupAt.toISOString() : null,
          volunteers_needed: Number(volunteersNeeded) || 0,
        },
      });
      await loadProfile();
      Alert.alert('Schedule updated', 'Your pickup plan has been saved.');
    } catch (error) {
      console.warn('Failed to update donor profile', error);
      Alert.alert('Save failed', 'We could not update your pickup plan. Try again.');
    } finally {
      setSaving(false);
    }
  }, [loadProfile, pickupAt, token, volunteersNeeded]);

  const operationsHelper = 'Coordinate your next pickup so volunteers know when to arrive.';
  const account = profile?.account;
  const activity = profile?.activity;
  const metrics = profile?.team?.metrics || {};
  const notifications = profile?.notifications;
  const preferences = profile?.preferences;
  const notes = profile?.notes;
  const notificationSummary = useMemo(() => {
    const channels = [
      notifications?.notify_email ? 'Email' : null,
      notifications?.notify_sms ? 'SMS' : null,
      notifications?.notify_push ? 'Push' : null,
    ].filter(Boolean) as string[];
    return channels.length ? channels.join(' • ') : 'No alerts configured';
  }, [notifications?.notify_email, notifications?.notify_sms, notifications?.notify_push]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Donor profile</Text>
          <Text style={[styles.subtitle, { color: palette.secondaryText }]}>Manage your team, pickup plans, and preferences in one place.</Text>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={palette.tint} size="large" />
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={styles.cardTitle}>Account</Text>
              <Text style={[styles.cardMeta, { color: palette.secondaryText }]}>Organization</Text>
              <Text style={[styles.cardValue, { color: palette.text }]}>{account?.organization_name || 'Add organization name'}</Text>
              <Text style={[styles.cardMeta, { color: palette.secondaryText }]}>Primary contact</Text>
              <Text style={[styles.cardValue, { color: palette.text }]}>{account?.contact_name || account?.email || 'Not set'}</Text>
              <Text style={[styles.cardMeta, { color: palette.secondaryText }]}>Phone</Text>
              <Text style={[styles.cardValue, { color: palette.text }]}>{profile?.profile?.contact_phone || 'Add phone number'}</Text>
              <View style={styles.metricsRow}>
                  <View style={[styles.metricPill, { backgroundColor: palette.tint }]}>
                    <Text style={styles.metricPillText}>{metrics.active ?? 0} active</Text>
                  </View>
                  <View style={[styles.metricPill, { backgroundColor: secondaryPill }]}>
                    <Text style={styles.metricPillText}>{metrics.invited ?? 0} invited</Text>
                  </View>
                  <View style={[styles.metricPill, { backgroundColor: tertiaryPill }]}>
                    <Text style={styles.metricPillText}>{metrics.total ?? 0} teammates</Text>
                  </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Pickup plan</Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker((prev) => (Platform.OS === 'ios' ? !prev : true))}
                  style={[styles.linkButton, { borderColor: palette.tint }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.linkButtonLabel, { color: palette.tint }]}>Edit</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.cardMeta, { color: palette.secondaryText }]}>{operationsHelper}</Text>
              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: palette.secondaryText }]}>Next pickup</Text>
                <Text style={[styles.fieldValue, { color: palette.text }]}>{formatDateLabel(pickupAt)}</Text>
              </View>
              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: palette.secondaryText }]}>Volunteers needed</Text>
                <TextInput
                  style={[styles.inlineInput, { borderColor: palette.border, color: palette.text, backgroundColor: colorScheme === 'dark' ? '#23272E' : '#F8FAFF' }]}
                  keyboardType="numeric"
                  value={volunteersNeeded}
                  onChangeText={setVolunteersNeeded}
                  placeholder="0"
                  placeholderTextColor={palette.secondaryText}
                />
              </View>
              {showDatePicker && (
                <View style={[styles.pickerFrame, { borderColor: palette.border, backgroundColor: colorScheme === 'dark' ? '#1B1F29' : '#FFF' }]}>
                  <DateTimePicker
                    value={pickupAt || new Date()}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={handleDateChange}
                  />
                </View>
              )}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: palette.tint }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save pickup plan</Text>}
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={styles.cardTitle}>Impact snapshot</Text>
              <View style={styles.statRow}>
                <View style={styles.statColumn}>
                  <Text style={[styles.statValue, { color: palette.text }]}>{activity?.meals_provided ?? 0}</Text>
                  <Text style={[styles.statLabel, { color: palette.secondaryText }]}>Meals provided</Text>
                </View>
                <View style={styles.statColumn}>
                  <Text style={[styles.statValue, { color: palette.text }]}>{activity?.co2_saved_lbs ?? 0}</Text>
                  <Text style={[styles.statLabel, { color: palette.secondaryText }]}>CO₂ saved (lbs)</Text>
                </View>
                <View style={styles.statColumn}>
                  <Text style={[styles.statValue, { color: palette.text }]}>{activity?.weekly_reservations ?? 0}</Text>
                  <Text style={[styles.statLabel, { color: palette.secondaryText }]}>Weekly reservations</Text>
                </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={styles.cardTitle}>Preferences</Text>
              <Text style={[styles.preferenceLine, { color: palette.text }]}>Default category · {preferences?.default_category || 'produce'}</Text>
              <Text style={[styles.preferenceLine, { color: palette.text }]}>Max daily pickups · {preferences?.max_daily_pickups ?? 8}</Text>
              <Text style={[styles.preferenceLine, { color: palette.text }]}>Pickup window · {preferences?.preferred_pickup_window ?? 90} minutes</Text>
              <View style={styles.toggleRow}>
                <View>
                  <Text style={[styles.toggleLabel, { color: palette.text }]}>Notifications</Text>
                  <Text style={[styles.toggleHelper, { color: palette.secondaryText }]}>Email · SMS · Push</Text>
                </View>
                <Text style={[styles.toggleStatus, { color: palette.secondaryText }]}>{notificationSummary}</Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={styles.cardTitle}>Team notes</Text>
              <Text style={[styles.notesText, { color: palette.secondaryText }]}>
                {notes ? notes : 'Share pickup instructions or special requests for volunteers.'}
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.logoutText}>Log out</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: Palette, mode: 'light' | 'dark') =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingTop: 40,
      paddingBottom: 48,
      paddingHorizontal: 24,
      gap: 20,
    },
    header: {
      gap: 6,
    },
    loader: {
      minHeight: 160,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: palette.text,
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
    },
    card: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 20,
      gap: 14,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: palette.text,
    },
    cardMeta: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    cardValue: {
      fontSize: 16,
      fontWeight: '600',
    },
    metricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    metricPill: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    metricPillText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    fieldBlock: {
      gap: 4,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
    },
    fieldValue: {
      fontSize: 16,
      fontWeight: '600',
    },
    inlineInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      fontWeight: '600',
      maxWidth: 140,
    },
    pickerFrame: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 8,
    },
    saveButton: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    saveText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    statColumn: {
      flex: 1,
      alignItems: 'flex-start',
      gap: 4,
    },
    statValue: {
      fontSize: 22,
      fontWeight: '700',
    },
    statLabel: {
      fontSize: 12,
      fontWeight: '600',
    },
    preferenceLine: {
      fontSize: 14,
      fontWeight: '600',
    },
    toggleRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleLabel: {
      fontSize: 14,
      fontWeight: '700',
    },
    toggleHelper: {
      fontSize: 12,
      fontWeight: '500',
      marginTop: 2,
    },
    toggleStatus: {
      fontSize: 13,
      fontWeight: '600',
    },
    linkButton: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    linkButtonLabel: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    notesText: {
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
    },
    logoutButton: {
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#DC2626',
      marginTop: 12,
      shadowColor: mode === 'dark' ? 'transparent' : '#0F172A',
      shadowOpacity: mode === 'dark' ? 0 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: mode === 'dark' ? 0 : 3,
    },
    logoutText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
  });
