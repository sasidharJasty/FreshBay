import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  getDonorDashboard,
  getDonorDonations,
} from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MapboxMap, isMapboxAvailable } from '@/components/mapbox-map';
import type { MapboxMarker, MapboxPolyline } from '@/components/mapbox-map';
import { FoodInspectionPanel } from '@/components/food-inspection-panel';
import { setPendingInspectionDraft } from '@/lib/inspection-drafts';
import { useRouter } from 'expo-router';

type DashboardData = {
  overview: {
    active_donations: number;
    reservations_today: number;
    ready_pickups: number;
  };
  smart_suggestions: string[];
  impact_summary: {
    meals_provided: number;
    co2_saved_lbs: number;
    freshness_score: number;
  };
  current_events: {
    id: number;
    title: string;
    status: string;
    max_pickups: number;
    reserved: number;
    remaining: number;
    zone?: string | null;
    next_pickup_window?: string | null;
  }[];
  route_map?: RouteMapPayload;
};

type RouteMapPayload = {
  stops: {
    id: number;
    title: string;
    status: string;
    quantity: number;
    zone: string;
    coordinates: { latitude: number; longitude: number };
    available_from?: string | null;
    available_until?: string | null;
  }[];
  polyline: { latitude: number; longitude: number }[];
  region: RegionShape;
  summary: {
    total_distance_miles: number;
    estimated_duration_minutes: number;
    next_pickup: string | null;
  };
};

type RegionShape = {
  latitude: number;
  longitude: number;
  latitude_delta: number;
  longitude_delta: number;
};

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Palette = {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  card: string;
  secondaryText: string;
  success: string;
  warning: string;
  danger: string;
};

export default function DonorsDashboard() {
  const auth = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const palette: Palette = useMemo(() => {
    const base = Colors[colorScheme];
    return {
      ...base,
      card: colorScheme === 'dark' ? '#1F2430' : '#F8FAFF',
      secondaryText: colorScheme === 'dark' ? '#9BA1A6' : '#5D6470',
    };
  }, [colorScheme]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [donationsCount, setDonationsCount] = useState(0);
  const [routeMap, setRouteMap] = useState<RouteMapPayload | null>(null);

  const mapSupported = isMapboxAvailable();

  const fetchDashboard = useCallback(async () => {
    if (!auth.token) return;
    setLoading(true);
    try {
      const [dashboardRes, donationsRes] = await Promise.all([
        getDonorDashboard(auth.token),
        getDonorDonations(auth.token),
      ]);
      setData(dashboardRes);
      setDonationsCount(donationsRes?.donations?.length ?? 0);
      setRouteMap(dashboardRes?.route_map ?? null);
    } catch (error) {
      console.warn('Failed to load donor dashboard', error);
    } finally {
      setLoading(false);
    }
  }, [auth.token]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleUseInspection = useCallback(
    (analysis: Record<string, any>, inspection: { id: number; created_at: string }) => {
      setPendingInspectionDraft({
        analysis,
        inspectionId: inspection.id,
        createdAt: inspection.created_at,
      });
      router.push('/(tabs)/donors/donate');
    },
    [router],
  );

  const onRefresh = useCallback(async () => {
    if (!auth.token) return;
    setRefreshing(true);
    try {
      await fetchDashboard();
    } finally {
      setRefreshing(false);
    }
  }, [auth.token, fetchDashboard]);

  const overviewItems = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'Active donations',
        value: data.overview.active_donations,
        icon: 'rocket',
        accent: '#6366F1',
      },
      {
        label: 'Reservations today',
        value: data.overview.reservations_today,
        icon: 'calendar',
        accent: '#F59E0B',
      },
      {
        label: 'Ready pickups',
        value: data.overview.ready_pickups,
        icon: 'bicycle',
        accent: '#10B981',
      },
    ];
  }, [data]);

  const mapRegion: MapRegion = useMemo(() => {
    if (!routeMap?.region) {
      return {
        latitude: 37.773972,
        longitude: -122.431297,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      };
    }
    return {
      latitude: routeMap.region.latitude,
      longitude: routeMap.region.longitude,
      latitudeDelta: routeMap.region.latitude_delta,
      longitudeDelta: routeMap.region.longitude_delta,
    };
  }, [routeMap?.region]);

  const mapMarkers: MapboxMarker[] = useMemo(() => {
    if (!routeMap?.stops?.length) {
      return [];
    }
    return routeMap.stops.reduce<MapboxMarker[]>((acc, stop) => {
      if (!stop?.coordinates) {
        return acc;
      }
      acc.push({
        id: String(stop.id),
        coordinate: stop.coordinates,
        title: stop.title,
        subtitle: stop.zone ? `${stop.zone} • ${stop.status}` : stop.status,
        color: stop.status === 'ready' ? '#F59E0B' : palette.tint,
      });
      return acc;
    }, []);
  }, [palette.tint, routeMap?.stops]);

  const mapPolylines: MapboxPolyline[] = useMemo(() => {
    if (!routeMap?.polyline?.length) {
      return [];
    }
    return [
      {
        id: 'route',
        coordinates: routeMap.polyline,
        color: palette.tint,
        width: 5,
      },
    ];
  }, [palette.tint, routeMap?.polyline]);

  if (loading && !data) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={palette.tint} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.text }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: palette.secondaryText }]}>
          Keep your donations flowing — {donationsCount} events live
        </Text>
      </View>

      <View style={styles.cardGrid}>
        {overviewItems.map((item) => (
          <View key={item.label} style={[styles.metricCard, { backgroundColor: palette.card }]}> 
            <View style={[styles.metricIcon, { backgroundColor: item.accent }]}> 
              <Ionicons name={item.icon as any} size={20} color="#fff" />
            </View>
            <Text style={[styles.metricValue, { color: palette.text }]}>{item.value}</Text>
            <Text style={[styles.metricLabel, { color: palette.secondaryText }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      {data?.smart_suggestions?.length ? (
        <View style={[styles.section, { backgroundColor: palette.card }]}> 
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Smart suggestions</Text>
            <Ionicons name="sparkles" size={18} color={palette.tint} />
          </View>
          {data.smart_suggestions.map((suggestion, idx) => (
            <View key={idx} style={styles.suggestionRow}>
              <View style={[styles.suggestionBullet, { backgroundColor: palette.tint }]} />
              <Text style={[styles.suggestionText, { color: palette.text }]}>{suggestion}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <FoodInspectionPanel
        token={auth.token}
        palette={palette}
        mode="donor"
        style={[styles.section, { backgroundColor: palette.card }]}
        onUseAnalysis={handleUseInspection}
      />

      {routeMap?.stops?.length ? (
        <View style={[styles.section, { backgroundColor: palette.card }]}> 
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Pickup map</Text>
            {routeMap.summary?.next_pickup ? (
              <Text style={[styles.sectionCaption, { color: palette.secondaryText }]}>Next stop: {routeMap.summary.next_pickup}</Text>
            ) : null}
          </View>
          <View style={styles.mapCard}>
            {mapSupported ? (
              <MapboxMap
                style={styles.map}
                initialRegion={mapRegion}
                markers={mapMarkers}
                polylines={mapPolylines}
                testID="donor-route-map"
              />
            ) : (
              <View style={styles.mapFallback}>
                <Text style={[styles.mapFallbackText, { color: palette.secondaryText }]}>
                  Add a Mapbox access token to preview the route map.
                </Text>
              </View>
            )}
            <View style={styles.mapSummaryRow}>
              <SummaryBlock
                label="Total distance"
                value={`${routeMap.summary?.total_distance_miles ?? 0} mi`}
                palette={palette}
              />
              <SummaryBlock
                label="Est. duration"
                value={`${routeMap.summary?.estimated_duration_minutes ?? 0} min`}
                palette={palette}
              />
              <SummaryBlock
                label="Stops"
                value={`${routeMap.stops.length}`}
                palette={palette}
              />
            </View>
          </View>
        </View>
      ) : null}

      {data?.impact_summary ? (
        <View style={[styles.section, { backgroundColor: palette.card }]}> 
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Impact snapshot</Text>
            <Ionicons name="earth" size={18} color={palette.tint} />
          </View>
          <View style={styles.impactGrid}>
            <ImpactCell label="Meals provided" value={`${data.impact_summary.meals_provided}`} palette={palette} />
            <ImpactCell label="CO₂ saved" value={`${data.impact_summary.co2_saved_lbs} lbs`} palette={palette} />
            <ImpactCell label="Freshness score" value={`${data.impact_summary.freshness_score}%`} palette={palette} />
          </View>
        </View>
      ) : null}

      {data?.current_events?.length ? (
        <View style={[styles.section, { backgroundColor: palette.card }]}> 
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Live events</Text>
            <Text style={[styles.sectionCaption, { color: palette.secondaryText }]}>
              Track reservations in real-time
            </Text>
          </View>
          {data.current_events.map((event) => (
            <TouchableOpacity key={event.id} activeOpacity={0.85} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <Text style={[styles.eventTitle, { color: palette.text }]}>{event.title}</Text>
                <StatusPill status={event.status} palette={palette} />
              </View>
              <View style={styles.eventMetaRow}>
                <EventMeta icon="people" label={`${event.reserved}/${event.max_pickups} claimed`} palette={palette} />
                <EventMeta icon="timer" label={`${event.remaining} slots left`} palette={palette} />
                {event.zone ? <EventMeta icon="location" label={event.zone} palette={palette} /> : null}
              </View>
              {event.next_pickup_window ? (
                <Text style={[styles.eventFooter, { color: palette.secondaryText }]}>
                  Next pickup: {new Date(event.next_pickup_window).toLocaleString()}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function ImpactCell({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: Palette;
}) {
  return (
    <View style={styles.impactCell}>
      <Text style={[styles.impactValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.impactLabel, { color: palette.secondaryText }]}>{label}</Text>
    </View>
  );
}

function StatusPill({
  status,
  palette,
}: {
  status: string;
  palette: Palette;
}) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    available: { label: 'Available', color: '#0F9D58', bg: '#DCFCE7' },
    reserved: { label: 'Reserved', color: '#D97706', bg: '#FEF3C7' },
    ready: { label: 'Ready', color: '#2563EB', bg: '#DBEAFE' },
    collected: { label: 'Collected', color: '#6B7280', bg: '#E5E7EB' },
    expired: { label: 'Expired', color: '#DC2626', bg: '#FEE2E2' },
  };
  const fallback = { label: status, color: palette.tint, bg: '#E0E7FF' };
  const config = map[status] || fallback;
  return (
    <View style={[styles.statusPill, { backgroundColor: config.bg }]}> 
      <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function EventMeta({
  icon,
  label,
  palette,
}: {
  icon: string;
  label: string;
  palette: Palette;
}) {
  return (
    <View style={styles.eventMeta}>
      <Ionicons name={icon as any} size={14} color={palette.secondaryText} />
      <Text style={[styles.eventMetaText, { color: palette.secondaryText }]}>{label}</Text>
    </View>
  );
}

function SummaryBlock({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: Palette;
}) {
  return (
    <View style={styles.summaryBlock}>
      <Text style={[styles.summaryValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: palette.secondaryText }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flexBasis: '31%',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    minWidth: 100,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.85,
  },
  section: {
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionCaption: {
    fontSize: 12,
    fontWeight: '500',
  },
  suggestionRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  suggestionBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  impactGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  impactCell: {
    flex: 1,
    paddingVertical: 8,
    gap: 4,
  },
  impactValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  impactLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  eventCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    gap: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  eventMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  eventMetaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  mapCard: {
    borderRadius: 16,
    overflow: 'hidden',
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(99, 102, 241, 0.15)',
  },
  map: {
    height: 220,
    width: '100%',
  },
  mapFallback: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  mapFallbackText: {
    fontSize: 13,
    fontWeight: '500',
  },
  mapSummaryRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
    paddingVertical: 12,
    justifyContent: 'space-around',
  },
  summaryBlock: {
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  eventFooter: {
    fontSize: 12,
    fontWeight: '500',
  },
});

