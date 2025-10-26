import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getVolunteerImpact } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ImpactPayload = {
  summary: {
    month_label: string;
    meals_delivered: number;
    miles_driven: number;
    co2_saved_kg: number;
    efficiency_score: number;
  };
  leaderboard: { name: string; efficiency_score: number; meals_delivered: number }[];
  badges: string[];
  streak_days: number;
};

export default function VolunteersImpact() {
  const { token } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [impact, setImpact] = useState<ImpactPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadImpact = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getVolunteerImpact(token);
      setImpact(res as ImpactPayload);
    } catch (error) {
      console.warn('Unable to fetch volunteer impact', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadImpact();
  }, [loadImpact]);

  if (loading && !impact) {
    return (
      <View style={[styles.safeArea, styles.centered]}>
        <ActivityIndicator color={palette.tint} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Your month of deliveries</Text>
          <Text style={styles.subtitle}>Celebrate the miles, meals, and emissions saved this month.</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Meals delivered</Text>
            <Text style={styles.summaryValue}>{impact?.summary?.meals_delivered ?? 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Miles driven</Text>
            <Text style={styles.summaryValue}>{impact?.summary?.miles_driven?.toFixed(1) ?? '0.0'}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>CO₂ saved</Text>
            <Text style={styles.summaryValue}>{impact?.summary?.co2_saved_kg?.toFixed(1) ?? '0.0'} kg</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Efficiency score</Text>
            <Text style={styles.summaryValue}>{impact?.summary?.efficiency_score?.toFixed(1) ?? '0.0'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Leaderboard</Text>
          <View style={styles.leaderboard}>
            {(impact?.leaderboard ?? []).map((row, index) => (
              <View key={`${row.name}-${index}`} style={styles.leaderRow}>
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderName}>{row.name}</Text>
                  <Text style={styles.leaderMeta}>{row.meals_delivered} meals • {row.efficiency_score.toFixed(1)} eff.</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Earned badges</Text>
          <View style={styles.badgeWrap}>
            {(impact?.badges?.length ? impact?.badges : ['Route Hero', 'Freshness Guardian', 'Night Owl'])?.map((badge) => (
              <View key={badge} style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ))}
          </View>
          <View style={styles.streakCard}>
            <Text style={styles.streakNumber}>{impact?.streak_days ?? 0}</Text>
            <Text style={styles.streakLabel}>day streak</Text>
            <Text style={styles.streakMeta}>Keep the momentum for additional perks next month.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: typeof Colors.light) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.background,
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingBottom: 64,
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: 32,
      gap: 10,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: palette.text,
      letterSpacing: -0.5,
    },
    subtitle: {
      color: palette.icon,
      fontSize: 14,
      lineHeight: 20,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: 16,
      paddingHorizontal: 24,
      marginTop: 20,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colorWithOpacity(palette.tint, 0.1),
      borderRadius: 18,
      padding: 18,
    },
    summaryLabel: {
      fontSize: 12,
      color: palette.icon,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    summaryValue: {
      marginTop: 8,
      fontSize: 22,
      fontWeight: '700',
      color: palette.text,
    },
    section: {
      marginTop: 32,
      paddingHorizontal: 24,
      gap: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: palette.text,
    },
    leaderboard: {
      gap: 12,
    },
    leaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 16,
      backgroundColor: colorWithOpacity(palette.tint, 0.08),
      gap: 16,
    },
    rank: {
      width: 28,
      fontSize: 18,
      fontWeight: '700',
      color: palette.tint,
      textAlign: 'center',
    },
    leaderName: {
      fontSize: 16,
      fontWeight: '700',
      color: palette.text,
    },
    leaderMeta: {
      fontSize: 12,
      color: palette.icon,
    },
    badgeWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    badge: {
      backgroundColor: palette.tint,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    badgeText: {
      color: '#fff',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontSize: 12,
    },
    streakCard: {
      marginTop: 16,
      backgroundColor: colorWithOpacity('#10B981', 0.14),
      borderRadius: 20,
      padding: 20,
      alignItems: 'center',
      gap: 6,
    },
    streakNumber: {
      fontSize: 32,
      fontWeight: '700',
      color: '#0F172A',
    },
    streakLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#0F172A',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    streakMeta: {
      fontSize: 12,
      textAlign: 'center',
      color: '#0F172A',
    },
  });

function colorWithOpacity(hex: string, opacity: number) {
  const normalizedOpacity = Math.min(Math.max(opacity, 0), 1);
  const alpha = Math.round(normalizedOpacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}
