import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDonorImpact } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type LeaderboardEntry = {
  rank: number;
  name: string;
  meals: number;
};

type ImpactTree = {
  tiers: { name: string; threshold: number; achieved: boolean }[];
  current: number;
};

type ImpactData = {
  leaderboard: LeaderboardEntry[];
  impact_tree: ImpactTree;
  badges: { label: string; earned: boolean }[];
};

type Palette = {
  text: string;
  background: string;
  tint: string;
  icon: string;
  secondaryText: string;
  card: string;
  border: string;
};

export default function DonorsImpact() {
  const { token } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const palette: Palette = useMemo(() => {
    const base = Colors[colorScheme as 'light' | 'dark'];
    return {
      ...base,
      secondaryText: colorScheme === 'dark' ? '#A8B1CE' : '#4B5563',
      card: colorScheme === 'dark' ? '#1F2430' : '#F8FAFF',
      border: colorScheme === 'dark' ? '#2D3240' : '#E2E8F0',
    } as Palette;
  }, [colorScheme]);

  const styles = useMemo(() => createStyles(palette), [palette]);

  const [impact, setImpact] = useState<ImpactData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadImpact = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getDonorImpact(token);
      setImpact(res);
    } catch (error) {
      console.warn('Failed to load donor impact', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadImpact();
  }, [loadImpact]);

  const tiers = impact?.impact_tree?.tiers ?? [];
  const currentMeals = impact?.impact_tree?.current ?? 0;
  const maxTier = tiers[tiers.length - 1]?.threshold ?? 1;
  const tierProgress = Math.min(1, maxTier ? currentMeals / maxTier : 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Your impact</Text>
          <Text style={[styles.subtitle, { color: palette.secondaryText }]}>Celebrate meals shared and see how close you are to the next milestone.</Text>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={palette.tint} size="large" />
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
              <Text style={styles.cardTitle}>Leaderboard</Text>
              <Text style={[styles.helper, { color: palette.secondaryText }]}>See how you compare across the FreshBay network this week.</Text>
              <View style={styles.leaderboard}>
                {impact?.leaderboard?.map((entry) => (
                  <View
                    key={entry.rank}
                    style={[styles.leaderRow, { borderColor: palette.border }]}>
                    <Text style={[styles.rank, { color: palette.tint }]}>{entry.rank}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.leaderName, { color: palette.text }]}>{entry.name}</Text>
                      <Text style={[styles.leaderMeta, { color: palette.secondaryText }]}>{entry.meals.toLocaleString()} meals donated</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
              <Text style={styles.cardTitle}>Impact tiers</Text>
              <Text style={[styles.helper, { color: palette.secondaryText }]}>Unlock badges as your meals donated grow.</Text>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, {
                    width: `${Math.max(8, tierProgress * 100)}%`,
                    backgroundColor: palette.tint,
                  }]}
                />
              </View>
              <View style={styles.tierRow}>
                {tiers.map((tier) => (
                  <View key={tier.name} style={styles.tierColumn}>
                    <View
                      style={[styles.tierDot, {
                        backgroundColor: tier.achieved ? palette.tint : palette.border,
                      }]}
                    />
                    <Text style={[styles.tierName, { color: palette.text }]}>{tier.name}</Text>
                    <Text style={[styles.tierThreshold, { color: palette.secondaryText }]}>{tier.threshold} meals</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.currentMeals, { color: palette.text }]}>Current: {currentMeals.toLocaleString()} meals</Text>
            </View>

            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
              <Text style={styles.cardTitle}>Badges</Text>
              <Text style={[styles.helper, { color: palette.secondaryText }]}>Aim for a perfect streak to unlock them all.</Text>
              <View style={styles.badgeRow}>
                {impact?.badges?.map((badge) => (
                  <View
                    key={badge.label}
                    style={[styles.badge, {
                      backgroundColor: badge.earned ? palette.tint : 'transparent',
                      borderColor: badge.earned ? palette.tint : palette.border,
                    }]}
                  >
                    <Text style={[styles.badgeText, { color: badge.earned ? '#fff' : palette.secondaryText }]}>
                      {badge.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: Palette) =>
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
    loader: {
      minHeight: 160,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 20,
      gap: 16,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: palette.text,
    },
    helper: {
      fontSize: 13,
      fontWeight: '500',
    },
    leaderboard: {
      gap: 12,
    },
    leaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
    },
    rank: {
      fontSize: 18,
      fontWeight: '700',
      width: 32,
      textAlign: 'center',
    },
    leaderName: {
      fontSize: 16,
      fontWeight: '700',
    },
    leaderMeta: {
      fontSize: 13,
      fontWeight: '500',
    },
    progressBar: {
      height: 12,
      borderRadius: 999,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.border,
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
    },
    tierRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    tierColumn: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
    },
    tierDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    tierName: {
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    tierThreshold: {
      fontSize: 11,
      fontWeight: '500',
      textAlign: 'center',
    },
    currentMeals: {
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'right',
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    badge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
  });
