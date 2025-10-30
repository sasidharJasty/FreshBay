import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MapboxMap, isMapboxAvailable } from '@/components/mapbox-map';
import type { MapboxMapHandle, MapboxMarker } from '@/components/mapbox-map';

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const DEFAULT_REGION: MapRegion = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const PIN_COLORS: Record<string, string> = {
  high: '#34D399',
  medium: '#FBBF24',
  low: '#F87171',
};

const LEGEND_ITEMS = [
  { key: 'high', label: 'High', color: PIN_COLORS.high },
  { key: 'medium', label: 'Moderate', color: PIN_COLORS.medium },
  { key: 'low', label: 'Low', color: PIN_COLORS.low },
];

type ZoneLike = {
  id?: string | number;
  name?: string;
  level_display?: string;
  level?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

type DonationLike = {
  id: string | number;
  title: string;
  donor_name?: string;
  freshness_notes?: string;
  distance_miles?: number | string;
  available_from?: string;
  quantity?: number;
  status_display?: string;
  pickup_address?: string | null;
  pickup_latitude?: number | string | null;
  pickup_longitude?: number | string | null;
  zone?: ZoneLike | null;
};

type FoodMapProps = {
  donations?: DonationLike[];
  zones?: ZoneLike[];
  height?: number;
  onSelectDonation?: (donation: DonationLike) => void;
};

type MapPoint = {
  key: string;
  latitude: number;
  longitude: number;
  title?: string;
  subtitle?: string;
  payload?: DonationLike;
  color?: string;
};

export function FoodMap({ donations = [], zones = [], height = 260, onSelectDonation }: FoodMapProps) {
  const [selected, setSelected] = useState<DonationLike | null>(null);
  const colorScheme = useColorScheme() ?? 'light';
  const styles = useMemo(() => createStyles(colorScheme as 'light' | 'dark'), [colorScheme]);
  const mapSupported = isMapboxAvailable();
  const mapRef = useRef<MapboxMapHandle | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const handleMapReady = useCallback(() => setMapReady(true), []);

  useEffect(() => {
    if (!mapSupported) {
      setMapReady(false);
    }
  }, [mapSupported]);

  const donationMarkers = useMemo<MapPoint[]>(() => {
    return donations
      .map((donation) => {
        const latitude = toNumber(donation?.pickup_latitude ?? donation?.zone?.latitude);
        const longitude = toNumber(donation?.pickup_longitude ?? donation?.zone?.longitude);
        if (latitude === null || longitude === null) return null;
        return {
          key: `donation-${donation.id}`,
          latitude,
          longitude,
          title: donation.title,
          subtitle: donation.donor_name,
          payload: donation,
          color: getPinColor(donation),
        } satisfies MapPoint;
      })
      .filter(Boolean) as MapPoint[];
  }, [donations]);

  const zoneMarkers = useMemo<MapPoint[]>(() => {
    return zones
      .map((zone) => {
        const latitude = toNumber(zone.latitude);
        const longitude = toNumber(zone.longitude);
        if (latitude === null || longitude === null) return null;
        const color = (() => {
          const normalized = `${zone.level ?? zone.level_display ?? ''}`.toLowerCase();
          if (normalized.includes('high')) return PIN_COLORS.high;
          if (normalized.includes('medium') || normalized.includes('moderate')) return PIN_COLORS.medium;
          if (normalized.includes('low')) return PIN_COLORS.low;
          return '#6C47FF';
        })();
        return {
          key: `zone-${zone.id}`,
          latitude,
          longitude,
          title: zone.name,
          subtitle: zone.level_display,
          color,
        } satisfies MapPoint;
      })
      .filter(Boolean) as MapPoint[];
  }, [zones]);

  const mapMarkers = useMemo(() => (donationMarkers.length ? donationMarkers : zoneMarkers), [donationMarkers, zoneMarkers]);

  const markerLookup = useMemo(() => {
    const lookup: Record<string, MapPoint> = {};
    mapMarkers.forEach((marker) => {
      lookup[marker.key] = marker;
    });
    return lookup;
  }, [mapMarkers]);

  const mapboxMarkers = useMemo<MapboxMarker[]>(() => {
    return mapMarkers.map((marker) => {
      const baseColor = marker.color ?? (marker.payload ? getPinColor(marker.payload) : '#6366F1');
      const isSelected = marker.payload ? selected?.id === marker.payload.id : false;
      return {
        id: marker.key,
        coordinate: { latitude: marker.latitude, longitude: marker.longitude },
        title: marker.title,
        subtitle: marker.subtitle,
        color: baseColor,
        selected: isSelected,
      } satisfies MapboxMarker;
    });
  }, [mapMarkers, selected]);

  const initialRegion = useMemo(() => {
    if (!mapMarkers.length) return DEFAULT_REGION;
    if (mapMarkers.length === 1) {
      const only = mapMarkers[0];
      return {
        latitude: only.latitude,
        longitude: only.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      } satisfies MapRegion;
    }

    const latitudes = mapMarkers.map((marker) => marker.latitude);
    const longitudes = mapMarkers.map((marker) => marker.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const latitude = (minLat + maxLat) / 2;
    const longitude = (minLng + maxLng) / 2;
    const latitudeDelta = Math.max(maxLat - minLat, 0.05) + 0.02;
    const longitudeDelta = Math.max(maxLng - minLng, 0.05) + 0.02;

    return { latitude, longitude, latitudeDelta, longitudeDelta } satisfies MapRegion;
  }, [mapMarkers]);

  const fitToMarkers = useCallback(() => {
    if (!mapReady || !mapRef.current || !mapMarkers.length) return;
    const coordinates = mapMarkers.map((marker) => ({ latitude: marker.latitude, longitude: marker.longitude }));
    mapRef.current.fitToCoordinates?.(coordinates, {
      edgePadding: { top: 80, right: 80, bottom: 140, left: 80 },
      animated: true,
    });
  }, [mapMarkers, mapReady]);

  useEffect(() => {
    if (!selected || !mapReady || !mapRef.current) return;
    const latitude = toNumber(selected.pickup_latitude ?? selected.zone?.latitude);
    const longitude = toNumber(selected.pickup_longitude ?? selected.zone?.longitude);
    if (latitude === null || longitude === null) return;
    mapRef.current.animateToRegion?.(
      {
        latitude,
        longitude,
        latitudeDelta: 0.045,
        longitudeDelta: 0.045,
      },
      350,
    );
  }, [mapReady, selected]);

  useEffect(() => {
    if (!mapReady) return;
    fitToMarkers();
  }, [fitToMarkers, mapReady]);

  const handleMarkerPress = useCallback(
    (markerId: string) => {
      const marker = markerLookup[markerId];
      if (!marker) return;
      if (marker.payload) {
        setSelected(marker.payload);
        onSelectDonation?.(marker.payload);
      } else {
        setSelected(null);
      }
    },
    [markerLookup, onSelectDonation],
  );

  const handleMapPress = useCallback(() => {
    setSelected(null);
  }, []);

  return (
    <View style={[styles.container, { height }]}>
      {mapSupported ? (
        <>
          <MapboxMap
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            markers={mapboxMarkers}
            onMapReady={handleMapReady}
            onMarkerPress={handleMarkerPress}
            onMapPress={handleMapPress}
            testID="food-map"
          />

          {mapMarkers.length > 0 && (
            <View style={styles.legendContainer} pointerEvents="none">
              {LEGEND_ITEMS.map((item) => (
                <View key={item.key} style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}

          {mapMarkers.length > 0 && (
            <TouchableOpacity style={styles.recenterButton} onPress={fitToMarkers} activeOpacity={0.85}>
              <Ionicons name="locate" size={18} color={colorScheme === 'dark' ? '#E5EDFF' : '#1E1B4B'} />
            </TouchableOpacity>
          )}

          {selected && (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.selectedCard}
              onPress={() => onSelectDonation?.(selected)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedLabel}>Featured pickup</Text>
                <Text style={styles.selectedTitle}>{selected.title}</Text>
                {!!selected.donor_name && <Text style={styles.selectedMeta}>{selected.donor_name}</Text>}
                <Text style={styles.selectedMeta}>
                  {formatDistance(selected.distance_miles)} • {selected.freshness_notes || selected.status_display || 'Ready now'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#6C47FF" />
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.mapFallback]}>
          <Ionicons name="map" size={28} style={styles.mapFallbackIcon} />
          <Text style={styles.mapFallbackText}>Add a Mapbox access token to enable the food map preview.</Text>
        </View>
      )}
    </View>
  );
}

function getPinColor(donation?: DonationLike | null) {
  const level = donation?.zone?.level || donation?.zone?.level_display?.toLowerCase();
  if (!level) return '#6C47FF';
  if (level.includes('high')) return PIN_COLORS.high;
  if (level.includes('medium') || level.includes('moderate')) return PIN_COLORS.medium;
  if (level.includes('low')) return PIN_COLORS.low;
  return '#6C47FF';
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isFinite(numeric) ? numeric : null;
}

function formatDistance(distance: number | string | null | undefined) {
  if (distance === null || distance === undefined) return 'Distance n/a';
  const numeric = typeof distance === 'string' ? Number.parseFloat(distance) : distance;
  if (!Number.isFinite(numeric)) return `${distance}`;
  const precision = numeric >= 10 ? 0 : 1;
  return `${numeric.toFixed(precision)} mi`;
}

const createStyles = (mode: 'light' | 'dark') => {
  const palette = Colors[mode];
  const surface = mode === 'dark' ? '#1F2430' : '#FFFFFF';
  const shadowColor = mode === 'dark' ? 'transparent' : '#000000';
  const labelColor = mode === 'dark' ? '#A0AEC0' : '#6B7280';
  const metaColor = mode === 'dark' ? '#A8B1C5' : '#4B5563';
  const overlaySurface = mode === 'dark' ? '#1F2430cc' : '#FFFFFFdd';

  return StyleSheet.create({
    container: {
      position: 'relative',
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: mode === 'dark' ? '#2D3142' : 'transparent',
    },
    legendContainer: {
      position: 'absolute',
      top: 16,
      left: 16,
      flexDirection: 'row',
      gap: 8,
    },
    legendPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: overlaySurface,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: mode === 'dark' ? '#2D3142' : 'transparent',
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    legendLabel: {
      fontSize: 11,
      color: labelColor,
      fontWeight: '600',
    },
    recenterButton: {
      position: 'absolute',
      bottom: 16,
      right: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: overlaySurface,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: mode === 'dark' ? '#2D3142' : '#E0E7FF',
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: mode === 'dark' ? 0 : 3,
    },
    selectedCard: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 16,
      backgroundColor: surface,
      padding: 16,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: mode === 'dark' ? '#2D3142' : 'transparent',
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 4,
    },
    selectedLabel: {
      fontSize: 12,
      color: labelColor,
      marginBottom: 4,
    },
    selectedTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: palette.text,
    },
    selectedMeta: {
      fontSize: 13,
      color: metaColor,
      marginTop: 2,
    },
    mapFallback: {
      backgroundColor: mode === 'dark' ? '#141824' : '#EFF3FF',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 16,
    },
    mapFallbackIcon: {
      color: mode === 'dark' ? '#5B6EAE' : '#4C51BF',
    },
    mapFallbackText: {
      textAlign: 'center',
      color: labelColor,
      fontSize: 14,
      fontWeight: '600',
    },
  });
};
