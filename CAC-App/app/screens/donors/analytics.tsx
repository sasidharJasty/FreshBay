import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getDonorAnalytics } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type AnalyticsData = {
  weekly_trends: { label: string; reservations: number; collected: number }[];
  category_mix: { category: string; count: number }[];
  spoilage_risk_score: number;
  ai_tips: string[];
};

type Palette = {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  secondaryText: string;
  card: string;
  border: string;
};

export default function DonorsAnalytics() {
  const auth = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const palette: Palette = useMemo(() => {
    const base = Colors[colorScheme];
    return {
      ...base,
      secondaryText: colorScheme === 'dark' ? '#9BA1A6' : '#6B7280',
      card: colorScheme === 'dark' ? '#1F2430' : '#F8FAFF',
      border: colorScheme === 'dark' ? '#2D3142' : '#E2E8F0',
    };
  }, [colorScheme]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);

  const loadAnalytics = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!auth.token) return;
      const silent = options?.silent ?? false;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const res = await getDonorAnalytics(auth.token);
        setData(res);
      } catch (error) {
        console.warn('Failed to load analytics', error);
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [auth.token],
  );

  const handleRefresh = useCallback(() => {
    loadAnalytics({ silent: true });
  }, [loadAnalytics]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor={palette.tint}
        titleColor={palette.tint}
      />
    ),
    [handleRefresh, palette.tint, refreshing],
  );

  if (!loading && !data) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: palette.background }]}
        contentContainerStyle={[styles.content, styles.emptyState]}
        refreshControl={refreshControl}
      >
        <View style={{ maxWidth: 320 }}>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 12 }}>
            We couldn’t load your analytics right now.
          </Text>
          <Text style={{ color: palette.secondaryText, fontSize: 14, fontWeight: '500', textAlign: 'center' }}>
            Pull to refresh or try again shortly.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (loading && !data) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={palette.tint} />
      </View>
    );
  }

  const weeklyTrends = data?.weekly_trends ?? [];
  const categoryMix = data?.category_mix ?? [];
  const aiTips = data?.ai_tips ?? [];
  const hasTrends = weeklyTrends.length > 0;
  const hasCategoryMix = categoryMix.length > 0;
  const hasTips = aiTips.length > 0;
  const maxReservations = hasTrends ? Math.max(...weeklyTrends.map((w) => w.reservations), 1) : 1;
  const categoryTotal = hasCategoryMix ? categoryMix.reduce((sum, c) => sum + c.count, 0) || 1 : 1;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
      refreshControl={refreshControl}
    >
      <Text style={[styles.heading, { color: palette.text }]}>Analytics</Text>
      <Text style={[styles.subheading, { color: palette.secondaryText }]}>Spot trends, reduce spoilage, and fine-tune your donation cadence.</Text>

      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Weekly reservations</Text>
          <Ionicons name="pulse" size={18} color={palette.tint} />
        </View>
        {hasTrends ? (
          <>
            <View style={styles.chartRow}>
              {weeklyTrends.map((item) => {
                const heightRatio = item.reservations / maxReservations;
                const collectedRatio = item.collected / maxReservations;
                return (
                  <View key={item.label} style={styles.chartColumn}>
                    <View style={styles.barFrame}>
                      <View style={[styles.barReservations, { height: Math.max(8, heightRatio * 120), backgroundColor: palette.tint }]} />
                      <View style={[styles.barCollected, { height: Math.max(4, collectedRatio * 120), backgroundColor: 'rgba(16,185,129,0.8)' }]} />
                    </View>
                    <Text style={[styles.chartLabel, { color: palette.secondaryText }]}>{item.label}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={[styles.helper, { color: palette.secondaryText }]}>Purple bars show total reservations; green overlays show confirmed pickups.</Text>
          </>
        ) : (
          <Text style={[styles.helper, { color: palette.secondaryText }]}>Post a donation to start tracking weekly reservation trends.</Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Category mix</Text>
          <Ionicons name="pie-chart" size={18} color={palette.tint} />
        </View>
        {hasCategoryMix ? (
          categoryMix.map((item) => {
            const pct = Math.round((item.count / categoryTotal) * 100);
            return (
              <View key={item.category} style={styles.mixRow}>
                <Text style={[styles.mixLabel, { color: palette.text }]}>{item.category}</Text>
                <View style={[styles.mixBar, { backgroundColor: palette.border }]}> 
                  <View style={[styles.mixFill, { width: `${pct}%`, backgroundColor: palette.tint }]} />
                </View>
                <Text style={[styles.mixValue, { color: palette.secondaryText }]}>{pct}%</Text>
              </View>
            );
          })
        ) : (
          <Text style={[styles.helper, { color: palette.secondaryText }]}>No category insights yet — add more donations to build this breakdown.</Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Spoilage risk</Text>
          <Ionicons name="warning" size={18} color={palette.tint} />
        </View>
        <View style={[styles.riskContainer, { borderColor: palette.border }]}> 
          <Text style={[styles.riskScore, { color: palette.tint }]}>{data?.spoilage_risk_score ?? 0}%</Text>
          <Text style={[styles.helper, { color: palette.secondaryText }]}>Lower is better — target &lt; 35%. Offer earlier pickups or smaller batch sizes.</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>AI tips</Text>
          <Ionicons name="bulb" size={18} color={palette.tint} />
        </View>
        {hasTips ? (
          aiTips.map((tip, idx) => (
            <View key={`${tip}-${idx}`} style={styles.tipRow}>
              <View style={[styles.tipBullet, { backgroundColor: palette.tint }]} />
              <Text style={[styles.tipText, { color: palette.text }]}>{tip}</Text>
            </View>
          ))
        ) : (
          <Text style={[styles.helper, { color: palette.secondaryText }]}>Once reservations start coming in, we’ll surface suggestions tailored to your pickup patterns.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 18,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  chartColumn: {
    alignItems: 'center',
    gap: 6,
  },
  barFrame: {
    width: 28,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
  },
  barReservations: {
    width: 18,
    borderRadius: 10,
  },
  barCollected: {
    width: 10,
    borderRadius: 10,
  },
  chartLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  helper: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  mixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mixLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  mixBar: {
    flex: 3,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  mixFill: {
    height: '100%',
    borderRadius: 999,
  },
  mixValue: {
    width: 40,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  riskContainer: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  riskScore: {
    fontSize: 32,
    fontWeight: '700',
  },
  tipRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  tipBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
});
