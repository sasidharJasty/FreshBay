import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { getVolunteerProfile, updateVolunteerProfile } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ProfilePayload = {
  phone_number?: string;
  vehicle_type?: string;
  vehicle_capacity?: string;
  license_plate?: string;
  driver_license_number?: string;
  availability?: string[];
  notify_email?: boolean;
  notify_sms?: boolean;
  notify_push?: boolean;
  preferred_shift_start?: string;
  preferred_shift_end?: string;
  verification_status?: string;
  miles_driven?: number;
  meals_delivered?: number;
  co2_saved_kg?: number;
  badges?: string[];
};

const WEEK_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function VolunteersProfile() {
  const { logout, token } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const styles = useMemo(() => createStyles(palette, colorScheme as 'light' | 'dark'), [palette, colorScheme]);

  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [availability, setAvailability] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getVolunteerProfile(token);
      setProfile(res);
      setAvailability(Array.isArray(res?.availability) ? res.availability : []);
    } catch (error) {
      console.warn('Unable to load volunteer profile', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const toggleAvailability = useCallback((day: string) => {
    setAvailability((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }, []);

  async function handleSave() {
    if (!token || !profile) return;
    setSaving(true);
    try {
      await updateVolunteerProfile(token, {
        phone_number: profile.phone_number,
        vehicle_type: profile.vehicle_type,
        vehicle_capacity: profile.vehicle_capacity,
        license_plate: profile.license_plate,
        driver_license_number: profile.driver_license_number,
        availability,
        notify_email: profile.notify_email,
        notify_sms: profile.notify_sms,
        notify_push: profile.notify_push,
        preferred_shift_start: profile.preferred_shift_start,
        preferred_shift_end: profile.preferred_shift_end,
      });
      Alert.alert('Profile updated', 'Availability and vehicle details saved.');
      await loadProfile();
    } catch (error: any) {
      Alert.alert('Unable to save', error?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch (err) {
      console.warn('Unable to log out', err);
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading && !profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={palette.tint} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Driver profile</Text>
      <Text style={styles.subtitle}>Keep details fresh so dispatch can match you with the right loads.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contact</Text>
        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor={palette.icon}
          value={profile?.phone_number ?? ''}
          keyboardType="phone-pad"
          onChangeText={(value) => setProfile((prev) => ({ ...(prev ?? {}), phone_number: value }))}
        />
        <Text style={styles.helper}>Dispatch uses this if a pantry lead needs to reach you.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Vehicle</Text>
        <TextInput
          style={styles.input}
          placeholder="Vehicle type (e.g. SUV, Cargo Van)"
          placeholderTextColor={palette.icon}
          value={profile?.vehicle_type ?? ''}
          onChangeText={(value) => setProfile((prev) => ({ ...(prev ?? {}), vehicle_type: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Capacity (e.g. 20 crates)"
          placeholderTextColor={palette.icon}
          value={profile?.vehicle_capacity ?? ''}
          onChangeText={(value) => setProfile((prev) => ({ ...(prev ?? {}), vehicle_capacity: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="License plate"
          placeholderTextColor={palette.icon}
          value={profile?.license_plate ?? ''}
          onChangeText={(value) => setProfile((prev) => ({ ...(prev ?? {}), license_plate: value }))}
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          placeholder="Driver ID / License number"
          placeholderTextColor={palette.icon}
          value={profile?.driver_license_number ?? ''}
          onChangeText={(value) => setProfile((prev) => ({ ...(prev ?? {}), driver_license_number: value }))}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Weekly availability</Text>
        <View style={styles.chipRow}>
          {WEEK_OPTIONS.map((day) => {
            const active = availability.includes(day);
            return (
              <TouchableOpacity
                key={day}
                onPress={() => toggleAvailability(day)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{day}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.shiftRow}>
          <TextInput
            style={[styles.input, styles.shiftInput]}
            placeholder="Shift start (e.g. 08:00)"
            placeholderTextColor={palette.icon}
            value={profile?.preferred_shift_start ?? ''}
            onChangeText={(value) => setProfile((prev) => ({ ...(prev ?? {}), preferred_shift_start: value }))}
          />
          <TextInput
            style={[styles.input, styles.shiftInput]}
            placeholder="Shift end (e.g. 17:00)"
            placeholderTextColor={palette.icon}
            value={profile?.preferred_shift_end ?? ''}
            onChangeText={(value) => setProfile((prev) => ({ ...(prev ?? {}), preferred_shift_end: value }))}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notifications</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Email updates</Text>
          <Switch
            value={!!profile?.notify_email}
            onValueChange={(value) => setProfile((prev) => ({ ...(prev ?? {}), notify_email: value }))}
            trackColor={{ true: palette.tint, false: palette.icon }}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>SMS alerts</Text>
          <Switch
            value={!!profile?.notify_sms}
            onValueChange={(value) => setProfile((prev) => ({ ...(prev ?? {}), notify_sms: value }))}
            trackColor={{ true: palette.tint, false: palette.icon }}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Push notifications</Text>
          <Switch
            value={!!profile?.notify_push}
            onValueChange={(value) => setProfile((prev) => ({ ...(prev ?? {}), notify_push: value }))}
            trackColor={{ true: palette.tint, false: palette.icon }}
          />
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricChip}>
          <Text style={styles.metricValue}>{profile?.meals_delivered ?? 0}</Text>
          <Text style={styles.metricLabel}>meals</Text>
        </View>
        <View style={styles.metricChip}>
          <Text style={styles.metricValue}>{profile?.miles_driven ?? 0}</Text>
          <Text style={styles.metricLabel}>miles</Text>
        </View>
        <View style={styles.metricChip}>
          <Text style={styles.metricValue}>{profile?.co2_saved_kg ?? 0}</Text>
          <Text style={styles.metricLabel}>kg CO₂</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save profile</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
        {loggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.logoutText}>Log out</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (palette: typeof Colors.light, mode: 'light' | 'dark') =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.background,
    },
    content: {
      padding: 24,
      paddingBottom: 64,
      gap: 22,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: palette.text,
    },
    subtitle: {
      color: palette.icon,
      marginTop: 4,
      fontSize: 14,
      lineHeight: 20,
    },
    card: {
      padding: 20,
      borderRadius: 20,
      backgroundColor: colorWithOpacity(palette.tint, 0.08),
      gap: 12,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: palette.text,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    input: {
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colorWithOpacity(palette.background, 0.95),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colorWithOpacity(palette.icon, 0.2),
      color: palette.text,
    },
    helper: {
      fontSize: 12,
      color: palette.icon,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.icon,
    },
    chipActive: {
      backgroundColor: palette.tint,
      borderColor: palette.tint,
    },
    chipText: {
      color: palette.icon,
      fontWeight: '600',
      fontSize: 12,
      textTransform: 'uppercase',
    },
    chipTextActive: {
      color: '#fff',
    },
    shiftRow: {
      flexDirection: 'row',
      gap: 12,
    },
    shiftInput: {
      flex: 1,
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    toggleLabel: {
      fontSize: 14,
      color: palette.text,
    },
    metricsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    metricChip: {
      flex: 1,
      backgroundColor: colorWithOpacity(palette.tint, 0.12),
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      gap: 4,
    },
    metricValue: {
      fontSize: 20,
      fontWeight: '700',
      color: palette.text,
    },
    metricLabel: {
      fontSize: 12,
      color: palette.icon,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    primaryButton: {
      backgroundColor: palette.tint,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      shadowColor: mode === 'dark' ? 'transparent' : palette.tint,
      shadowOpacity: mode === 'dark' ? 0 : 0.18,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 14,
      elevation: mode === 'dark' ? 0 : 4,
    },
    primaryButtonText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
    logoutButton: {
      marginTop: 12,
      backgroundColor: '#DC2626',
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
    },
    logoutText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 15,
    },
  });

function colorWithOpacity(hex: string, opacity: number) {
  const normalizedOpacity = Math.min(Math.max(opacity, 0), 1);
  const alpha = Math.round(normalizedOpacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}
