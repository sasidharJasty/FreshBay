import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { searchAgritourism } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MapboxMap, isMapboxAvailable } from '@/components/mapbox-map';
import type { MapboxMapHandle, MapboxMarker, MapboxRegion, MapboxRegionChangeInfo } from '@/components/mapbox-map';

const PRIMARY = '#6C47FF';
const REGION_DELTA_THRESHOLD = 0.12;
const ZOOM_DELTA_THRESHOLD = 0.18;

type Palette = typeof Colors.light;

type AgritourismSite = {
  id: string;
  name: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  website?: string;
  latitude?: number | null;
  longitude?: number | null;
  distance?: number | null;
  products?: string;
  season?: string;
  description?: string;
};

type AgritourismQueryParams = {
  city?: string;
  state?: string;
  keywords?: string;
  radius?: number;
  latitude?: number;
  longitude?: number;
};

type RawAgritourismRecord = Record<string, unknown>;

type MarkerPoint = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
};

const FILTER_OPTIONS = [
  { id: 'family', label: 'Family-friendly', keywords: ['family', 'kids activities'] },
  { id: 'u-pick', label: 'U-pick', keywords: ['u-pick', 'pick your own'] },
  { id: 'farm-stay', label: 'Farm stays', keywords: ['farm stay', 'lodging'] },
  { id: 'tastings', label: 'Tastings', keywords: ['tasting', 'dinner'] },
  { id: 'market', label: 'Markets', keywords: ['farmers market', 'market'] },
] as const;

const AGRITOURISM_FALLBACK: AgritourismSite[] = [
  {
    id: 'fallback-salinas',
    name: 'Harvest Moon Family Farm',
    street: '123 Orchard Lane',
    city: 'Salinas',
    state: 'CA',
    zip: '93901',
    phone: '(555) 219-0044',
    website: 'https://harvestmoonfarm.example.com',
    latitude: 36.6777,
    longitude: -121.6555,
    products: 'U-pick berries, hayrides, seasonal dinners',
    season: 'May - October',
    description: 'Family-friendly agritourism hub with weekend tours and farm-to-table tastings.',
    distance: 12.5,
  },
  {
    id: 'fallback-napa',
    name: 'Valley View Lavender Ranch',
    street: '455 Lavender Ridge Rd',
    city: 'Napa',
    state: 'CA',
    zip: '94559',
    phone: '(555) 842-1182',
    website: 'https://valleyviewlavender.example.com',
    latitude: 38.2975,
    longitude: -122.2869,
    products: 'Lavender harvest walks, distillery demos, farm shop',
    season: 'April - September',
    description: 'Guided aroma tours with hands-on lavender harvesting and artisan workshops.',
    distance: 46.2,
  },
  {
    id: 'fallback-yolo',
    name: 'Riverbend Heritage Ranch',
    street: '89 County Road 22B',
    city: 'Woodland',
    state: 'CA',
    zip: '95776',
    phone: '(555) 764-3301',
    website: 'https://riverbendheritage.example.com',
    latitude: 38.6785,
    longitude: -121.7733,
    products: 'Historic farm stays, cider tastings, educational tours',
    season: 'Year-round',
    description: 'Generational ranch with overnight cabins and weekend harvest experiences.',
    distance: 82.4,
  },
];

const DEFAULT_REGION: MapboxRegion = {
  latitude: 37.773972,
  longitude: -122.431297,
  latitudeDelta: 1.6,
  longitudeDelta: 1.6,
};

export default function AgritourismScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const styles = useMemo(() => createStyles(palette, colorScheme as 'light' | 'dark'), [palette, colorScheme]);
  const placeholderColor = colorScheme === 'dark' ? '#46506B' : '#9AA5CF';
  const fallbackIconColor = colorScheme === 'dark' ? '#A0AEC0' : '#6B7280';
  const { token } = useAuth();

  const [city, setCity] = useState('');
  const [state, setState] = useState('CA');
  const [keywords, setKeywords] = useState('farm tour');
  const [radius, setRadius] = useState<number>(50);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AgritourismSite[]>(AGRITOURISM_FALLBACK);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState<MapboxRegion | null>(DEFAULT_REGION);
  const [lastSearchRegion, setLastSearchRegion] = useState<MapboxRegion | null>(DEFAULT_REGION);
  const [needsRegionSearch, setNeedsRegionSearch] = useState(false);

  const radiusOptions = useMemo(() => [10, 25, 50, 100], []);
  const mapSupported = isMapboxAvailable();
  const mapRef = useRef<MapboxMapHandle | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const filterKeywordLookup = useMemo(() => {
    const lookup = new Map<string, readonly string[]>();
    FILTER_OPTIONS.forEach((option) => lookup.set(option.id, option.keywords));
    return lookup;
  }, []);

  const filterKeywords = useMemo(() => selectedFilters.flatMap((id) => filterKeywordLookup.get(id) ?? []), [selectedFilters, filterKeywordLookup]);

  const combinedKeywords = useMemo(() => {
    const base = keywords.trim();
    const extra = filterKeywords.join(' ');
    return [base, extra].filter(Boolean).join(' ');
  }, [keywords, filterKeywords]);

  const markerPoints = useMemo<MarkerPoint[]>(() => {
    return results
      .map((site) => {
        if (site.latitude == null || site.longitude == null) {
          return null;
        }
        const subtitle = [site.city, site.state].filter(Boolean).join(', ');
        return {
          id: site.id,
          latitude: site.latitude,
          longitude: site.longitude,
          title: site.name || 'Agritourism experience',
          subtitle: subtitle || undefined,
        } satisfies MarkerPoint;
      })
      .filter(Boolean) as MarkerPoint[];
  }, [results]);

  useEffect(() => {
    if (!markerPoints.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !markerPoints.some((point) => point.id === selectedId)) {
      setSelectedId(markerPoints[0].id);
    }
  }, [markerPoints, selectedId]);

  const mapMarkers = useMemo<MapboxMarker[]>(() => {
    return markerPoints.map((point) => ({
      id: point.id,
      coordinate: { latitude: point.latitude, longitude: point.longitude },
      title: point.title,
      subtitle: point.subtitle,
      color: PRIMARY,
      selected: selectedId === point.id,
    } satisfies MapboxMarker));
  }, [markerPoints, selectedId]);

  const selectedSite = useMemo(() => results.find((site) => site.id === selectedId) ?? null, [results, selectedId]);

  const initialRegion = useMemo<MapboxRegion>(() => deriveRegion(markerPoints) ?? DEFAULT_REGION, [markerPoints]);

  useEffect(() => {
    setMapRegion(initialRegion);
    setLastSearchRegion(initialRegion);
    setNeedsRegionSearch(false);
  }, [initialRegion.latitude, initialRegion.longitude, initialRegion.latitudeDelta, initialRegion.longitudeDelta]);

  const fitToMarkers = useCallback(() => {
    if (!mapReady || !markerPoints.length || !mapRef.current) {
      return;
    }
    const coordinates = markerPoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 80, right: 80, bottom: 180, left: 80 },
      animated: true,
    });
  }, [mapReady, markerPoints]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  useEffect(() => {
    if (!mapReady) {
      return;
    }
    fitToMarkers();
  }, [mapReady, fitToMarkers]);

  const handleMarkerPress = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleRegionDidChange = useCallback(
    (region: MapboxRegion, info: MapboxRegionChangeInfo) => {
      setMapRegion(region);
      if (!info.isUserInteraction || !lastSearchRegion) {
        return;
      }
      const latitudeMoved = Math.abs(region.latitude - lastSearchRegion.latitude) > REGION_DELTA_THRESHOLD;
      const longitudeMoved = Math.abs(region.longitude - lastSearchRegion.longitude) > REGION_DELTA_THRESHOLD;
      const zoomChanged =
        Math.abs(region.latitudeDelta - lastSearchRegion.latitudeDelta) > ZOOM_DELTA_THRESHOLD ||
        Math.abs(region.longitudeDelta - lastSearchRegion.longitudeDelta) > ZOOM_DELTA_THRESHOLD;
      setNeedsRegionSearch(latitudeMoved || longitudeMoved || zoomChanged);
    },
    [lastSearchRegion],
  );

  const toggleFilter = useCallback((id: string) => {
    setSelectedFilters((current) => {
      if (current.includes(id)) {
        return current.filter((entry) => entry !== id);
      }
      return [...current, id];
    });
  }, []);

  const executeSearch = useCallback(
    async (regionOverride?: MapboxRegion | null) => {
      const targetRegion = regionOverride ?? mapRegion ?? initialRegion;
      setLoading(true);
      setError(null);
      try {
        const listings = await fetchAgritourismListings(token, {
          city,
          state,
          keywords: combinedKeywords,
          radius,
          latitude: targetRegion?.latitude,
          longitude: targetRegion?.longitude,
        });
        setResults(listings);
        if (targetRegion) {
          setLastSearchRegion(targetRegion);
          setMapRegion(targetRegion);
        }
        setNeedsRegionSearch(false);
      } catch (err: any) {
        setError(err?.message || 'Unable to load agritourism listings right now.');
      } finally {
        setLoading(false);
      }
    },
    [token, city, state, combinedKeywords, radius, mapRegion, initialRegion],
  );

  const handleSearch = useCallback(() => {
    executeSearch(mapRegion);
  }, [executeSearch, mapRegion]);

  const handleOpenMaps = useCallback((site: AgritourismSite) => {
    if (site.latitude && site.longitude) {
      const coords = `${site.latitude},${site.longitude}`;
      const label = encodeURIComponent(site.name);
      const url =
        Platform.select({
          ios: `http://maps.apple.com/?ll=${coords}&q=${label}`,
          android: `geo:${coords}?q=${coords}(${label})`,
        }) ?? `https://www.google.com/maps/search/?api=1&query=${coords}`;
      Linking.openURL(url).catch((err) => console.warn('Failed to open map link', err));
      return;
    }
    const query = encodeURIComponent([site.name, site.street, site.city, site.state].filter(Boolean).join(', '));
    const fallbackUrl =
      Platform.select({ ios: `http://maps.apple.com/?q=${query}`, android: `geo:0,0?q=${query}` }) ??
      `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.openURL(fallbackUrl).catch((err) => console.warn('Failed to open map link', err));
  }, []);

  const handleCall = useCallback((site: AgritourismSite) => {
    if (!site.phone) {
      return;
    }
    const digits = site.phone.replace(/[^\d+]/g, '');
    if (!digits) {
      return;
    }
    Linking.openURL(`tel:${digits}`).catch((err) => console.warn('Failed to open phone dialer', err));
  }, []);

  const handleWebsite = useCallback((site: AgritourismSite) => {
    if (!site.website) {
      return;
    }
    const url = site.website.startsWith('http') ? site.website : `https://${site.website}`;
    Linking.openURL(url).catch((err) => console.warn('Failed to open website', err));
  }, []);

  const searchAreaOffset = selectedSite ? 148 : 76;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.mapSection}>
        {mapSupported ? (
          <>
            <MapboxMap
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={initialRegion}
              markers={mapMarkers}
              onMapReady={handleMapReady}
              onMarkerPress={handleMarkerPress}
              onMapPress={() => setSelectedId(null)}
              onRegionDidChange={handleRegionDidChange}
              testID="agritourism-map"
            />

            <View style={styles.mapOverlay}>
              <View style={styles.overlayHeader}>
                <Text style={styles.title}>Plan an agritourism visit</Text>
                <Text style={styles.subtitle}>Move the map, choose filters, and search nearby experiences.</Text>
              </View>

              <View style={styles.filterCard}>
                <View style={styles.locationRow}>
                  <View style={styles.locationInputWrap}>
                    <TextInput
                      value={city}
                      onChangeText={setCity}
                      placeholder="City"
                      placeholderTextColor={placeholderColor}
                      style={styles.input}
                      returnKeyType="next"
                    />
                  </View>
                  <View style={styles.stateInputWrap}>
                    <TextInput
                      value={state}
                      onChangeText={(next) => setState(next.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase())}
                      placeholder="CA"
                      placeholderTextColor={placeholderColor}
                      style={[styles.input, styles.stateInput]}
                      autoCapitalize="characters"
                      maxLength={2}
                    />
                  </View>
                </View>

                <View style={styles.searchRow}>
                  <Ionicons
                    name="search"
                    size={16}
                    color={colorScheme === 'dark' ? '#9AA5CF' : PRIMARY}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    value={keywords}
                    onChangeText={setKeywords}
                    placeholder="Pumpkin patches, farm stays, tastings"
                    placeholderTextColor={placeholderColor}
                    style={styles.searchInput}
                    returnKeyType="search"
                    onSubmitEditing={handleSearch}
                  />
                  <TouchableOpacity
                    style={styles.searchButton}
                    onPress={handleSearch}
                    disabled={loading}
                    activeOpacity={0.9}
                  >
                    {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.searchButtonText}>Search</Text>}
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterChips}
                >
                  {FILTER_OPTIONS.map((filter) => {
                    const active = selectedFilters.includes(filter.id);
                    return (
                      <TouchableOpacity
                        key={filter.id}
                        style={[styles.filterChip, active && styles.filterChipActive]}
                        onPress={() => toggleFilter(filter.id)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.radiusRow}>
                  <Text style={styles.radiusLabel}>Radius</Text>
                  <View style={styles.radiusChips}>
                    {radiusOptions.map((value) => {
                      const active = radius === value;
                      return (
                        <TouchableOpacity
                          key={value}
                          style={[styles.radiusChip, active && styles.radiusChipActive]}
                          onPress={() => setRadius(value)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.radiusChipText, active && styles.radiusChipTextActive]}>{value} mi</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>

            {markerPoints.length > 0 ? (
              <TouchableOpacity style={styles.recenterButton} onPress={fitToMarkers} activeOpacity={0.85}>
                <Ionicons name="locate" size={18} color={colorScheme === 'dark' ? '#E5EDFF' : '#1E1B4B'} />
              </TouchableOpacity>
            ) : null}

            {needsRegionSearch ? (
              <TouchableOpacity
                style={[styles.searchAreaButton, { bottom: searchAreaOffset }]}
                onPress={() => executeSearch(mapRegion)}
                activeOpacity={0.92}
              >
                <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.searchAreaText}>Search this area</Text>
              </TouchableOpacity>
            ) : null}

            {selectedSite ? (
              <View style={styles.bottomSheet}>
                <View style={styles.bottomSheetHeader}>
                  <Text style={styles.bottomSheetTitle}>{selectedSite.name}</Text>
                  {selectedSite.distance !== null && selectedSite.distance !== undefined ? (
                    <Text style={styles.bottomSheetDistance}>{formatDistance(selectedSite.distance)}</Text>
                  ) : null}
                </View>
                <Text style={styles.bottomSheetAddress} numberOfLines={2}>
                  {[selectedSite.street, selectedSite.city, selectedSite.state, selectedSite.zip].filter(Boolean).join(', ')}
                </Text>
                {selectedSite.products ? (
                  <Text style={styles.bottomSheetMeta} numberOfLines={2}>
                    Highlights: {selectedSite.products}
                  </Text>
                ) : null}
                {selectedSite.season ? <Text style={styles.bottomSheetMeta}>Season: {selectedSite.season}</Text> : null}
                <View style={styles.siteActions}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => handleOpenMaps(selectedSite)} activeOpacity={0.85}>
                    <Ionicons name="map-outline" size={16} color={PRIMARY} />
                    <Text style={styles.actionLabel}>Map</Text>
                  </TouchableOpacity>
                  {selectedSite.phone ? (
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleCall(selectedSite)} activeOpacity={0.85}>
                      <Ionicons name="call-outline" size={16} color={PRIMARY} />
                      <Text style={styles.actionLabel}>Call</Text>
                    </TouchableOpacity>
                  ) : null}
                  {selectedSite.website ? (
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleWebsite(selectedSite)} activeOpacity={0.85}>
                      <Ionicons name="globe-outline" size={16} color={PRIMARY} />
                      <Text style={styles.actionLabel}>Website</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.mapFallback}>
            <Ionicons name="map" size={24} color={fallbackIconColor} style={{ marginBottom: 8 }} />
            <Text style={styles.mapFallbackText}>Add a Mapbox access token to preview agritourism locations.</Text>
          </View>
        )}
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

async function fetchAgritourismListings(
  token: string | null | undefined,
  params: AgritourismQueryParams,
): Promise<AgritourismSite[]> {
  const query = buildAgritourismQuery(params);
  try {
  const response = await searchAgritourism(token, query);
    const records: RawAgritourismRecord[] = Array.isArray(response?.results)
      ? (response.results as RawAgritourismRecord[])
      : [];
    const normalised = normaliseAgritourismRecords(records);
    if (normalised.length) {
      return normalised;
    }

    const fallbackRecords: RawAgritourismRecord[] = Array.isArray(response?.fallback_results)
      ? (response.fallback_results as RawAgritourismRecord[])
      : [];
    const fallbackNormalised = normaliseAgritourismRecords(fallbackRecords);
    if (fallbackNormalised.length) {
      return fallbackNormalised;
    }

    return AGRITOURISM_FALLBACK;
  } catch (error) {
    console.warn('Agritourism lookup failed, falling back to sample data.', error);
    return AGRITOURISM_FALLBACK;
  }
}

function buildAgritourismQuery(params: AgritourismQueryParams) {
  const query = new URLSearchParams();
  if (params.city) {
    query.append('city', params.city.trim());
  }
  if (params.state) {
    query.append('state', params.state.trim().toUpperCase());
  }
  if (params.keywords) {
    query.append('q', params.keywords.trim());
  }
  if (typeof params.radius === 'number' && params.radius > 0) {
    query.append('radius', String(Math.min(params.radius, 200)));
  }
  if (typeof params.latitude === 'number' && Number.isFinite(params.latitude)) {
    query.append('latitude', params.latitude.toFixed(4));
  }
  if (typeof params.longitude === 'number' && Number.isFinite(params.longitude)) {
    query.append('longitude', params.longitude.toFixed(4));
  }
  return query.toString();
}

function normaliseAgritourismRecords(records: RawAgritourismRecord[]): AgritourismSite[] {
  return records
    .map((record) => {
      const id = pickString(record, ['id', 'source_id', 'listing_id', 'FMID']);
      const latitude = pickNumber(record, ['latitude', 'lat']);
      const longitude = pickNumber(record, ['longitude', 'lon', 'lng']);
      const distance = pickNumber(record, ['distance']);
      return {
        id: id || `agritourism-${Math.random().toString(36).slice(2, 11)}`,
        name: pickString(record, ['name', 'listing_name', 'MarketName']) || 'Agritourism experience',
        street: pickString(record, ['street', 'address1', 'address', 'Address']),
        city: pickString(record, ['city', 'City']),
        state: pickString(record, ['state', 'State']),
        zip: pickString(record, ['zip', 'Zip']),
        phone: pickString(record, ['phone', 'Phone']),
        website: pickString(record, ['website', 'Website', 'web_address']),
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        distance: Number.isFinite(distance) ? distance : null,
        products: pickString(record, ['products', 'Products', 'highlights']),
        season: pickString(record, ['season', 'Season', 'seasonality']),
        description: pickString(record, ['description', 'Description', 'listing_description']),
      } satisfies AgritourismSite;
    })
    .filter((site) => Boolean(site?.name));
}

function pickString(record: RawAgritourismRecord, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function pickNumber(record: RawAgritourismRecord, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const numeric = Number.parseFloat(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }
  return null;
}

function deriveRegion(points: MarkerPoint[]) {
  if (!points.length) {
    return null;
  }
  if (points.length === 1) {
    const only = points[0];
    return {
      latitude: only.latitude,
      longitude: only.longitude,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    } satisfies MapboxRegion;
  }
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  const latitudeDelta = Math.max(maxLat - minLat, 0.05) + 0.04;
  const longitudeDelta = Math.max(maxLng - minLng, 0.05) + 0.04;
  return { latitude, longitude, latitudeDelta, longitudeDelta } satisfies MapboxRegion;
}

function formatDistance(distance: number | string | null | undefined) {
  if (distance === null || distance === undefined) {
    return 'Distance N/A';
  }
  const numeric = typeof distance === 'string' ? Number.parseFloat(distance) : distance;
  if (!Number.isFinite(numeric)) {
    return `${distance}`;
  }
  const precision = numeric >= 10 ? 0 : 1;
  return `${numeric.toFixed(precision)} mi`;
}

const createStyles = (palette: Palette, mode: 'light' | 'dark') => {
  const border = mode === 'dark' ? '#2F3545' : '#E5E7EB';
  const muted = mode === 'dark' ? '#94A3B8' : '#6B7280';
  const secondary = mode === 'dark' ? '#B3BCD6' : '#4B5563';
  const overlayBg = mode === 'dark' ? '#1F2430ee' : '#FFFFFFf3';
  const surfaceMuted = mode === 'dark' ? '#262D3C' : '#EEF2FF';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.background ?? '#F5F7FF',
    },
    mapSection: {
      flex: 1,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: mode === 'dark' ? '#1F2430' : '#EFF3FF',
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      minHeight: 420,
    },
    mapOverlay: {
      position: 'absolute',
      top: 18,
      left: 18,
      right: 18,
      gap: 12,
    },
    overlayHeader: {
      gap: 2,
    },
    title: {
      fontSize: 22,
      fontWeight: '600',
      color: palette.text,
    },
    subtitle: {
      fontSize: 12,
      color: secondary,
    },
    filterCard: {
      backgroundColor: overlayBg,
      borderRadius: 18,
      padding: 12,
      gap: 12,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor: mode === 'dark' ? 'transparent' : '#101828',
      shadowOpacity: mode === 'dark' ? 0 : 0.07,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 2,
    },
    locationRow: {
      flexDirection: 'row',
      gap: 12,
    },
    locationInputWrap: {
      flex: 1,
    },
    stateInputWrap: {
      flexBasis: 74,
    },
    input: {
      backgroundColor: mode === 'dark' ? '#181E2A' : '#F8F9FF',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      color: palette.text,
      borderWidth: 1,
      borderColor: mode === 'dark' ? '#2D3544' : '#D3DAFF',
      fontSize: 14,
    },
    stateInput: {
      textAlign: 'center',
      textTransform: 'uppercase',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: mode === 'dark' ? '#181E2A' : '#F5F7FF',
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: mode === 'dark' ? '#2D3544' : '#CED5FB',
      minHeight: 40,
    },
    searchInput: {
      flex: 1,
      color: palette.text,
      fontSize: 13,
      paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    },
    searchButton: {
      marginLeft: 6,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: PRIMARY,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchButtonText: {
      color: '#FFFFFF',
      fontWeight: '600',
      fontSize: 13,
    },
    filterChips: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 2,
    },
    filterChip: {
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: surfaceMuted,
    },
    filterChipActive: {
      backgroundColor: PRIMARY,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: secondary,
    },
    filterChipTextActive: {
      color: '#FFFFFF',
    },
    radiusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    radiusLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: muted,
    },
    radiusChips: {
      flexDirection: 'row',
      gap: 8,
    },
    radiusChip: {
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: surfaceMuted,
    },
    radiusChipActive: {
      backgroundColor: PRIMARY,
    },
    radiusChipText: {
      fontSize: 12,
      color: secondary,
      fontWeight: '600',
    },
    radiusChipTextActive: {
      color: '#FFFFFF',
    },
    recenterButton: {
      position: 'absolute',
      bottom: 18,
      right: 18,
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: mode === 'dark' ? '#1F2430dd' : '#FFFFFFee',
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: mode === 'dark' ? '#2D3544' : '#DCE1FF',
      shadowColor: mode === 'dark' ? 'transparent' : '#101828',
      shadowOpacity: mode === 'dark' ? 0 : 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 3,
    },
    searchAreaButton: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 22,
      backgroundColor: PRIMARY,
      shadowColor: '#101828',
      shadowOpacity: mode === 'dark' ? 0.15 : 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 2 : 4,
    },
    searchAreaText: {
      color: '#FFFFFF',
      fontWeight: '600',
      fontSize: 14,
    },
    bottomSheet: {
      position: 'absolute',
      left: 18,
      right: 18,
      bottom: 24,
      borderRadius: 20,
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: mode === 'dark' ? '#1F2430f2' : '#FFFFFFf7',
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: mode === 'dark' ? '#2D3544' : '#DCE1FF',
      shadowColor: '#101828',
      shadowOpacity: mode === 'dark' ? 0.25 : 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: mode === 'dark' ? 4 : 6,
    },
    bottomSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    bottomSheetTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: palette.text,
      marginRight: 8,
    },
    bottomSheetDistance: {
      fontSize: 12,
      fontWeight: '600',
      color: PRIMARY,
    },
    bottomSheetAddress: {
      fontSize: 12,
      color: secondary,
      marginBottom: 4,
    },
    bottomSheetMeta: {
      fontSize: 12,
      color: muted,
    },
    siteActions: {
      marginTop: 10,
      flexDirection: 'row',
      gap: 12,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    actionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: PRIMARY,
    },
    mapFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: mode === 'dark' ? '#1F2430' : '#EFF3FF',
    },
    mapFallbackText: {
      textAlign: 'center',
      color: secondary,
      fontSize: 13,
    },
    errorContainer: {
      marginHorizontal: 18,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: mode === 'dark' ? '#3B1D2A' : '#FEE2E2',
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: mode === 'dark' ? '#FCA5A5' : 'transparent',
    },
    errorText: {
      color: mode === 'dark' ? '#FCA5A5' : '#B91C1C',
      fontSize: 13,
    },
  });
};
