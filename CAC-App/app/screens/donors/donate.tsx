import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { MapboxMap, isMapboxAvailable } from '@/components/mapbox-map';
import type { MapboxMapHandle, MapboxMarker } from '@/components/mapbox-map';
import type { FoodInspectionRecord } from '@/components/food-inspection-panel';

import {
  createDonorDonation,
  getFoodInspections,
  getDonorAutoRoute,
  getDonorDonationClaims,
  getDonorDonations,
  uploadFoodInspection,
  updateDonorClaim,
  updateDonorDonation,
} from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { consumePendingInspectionDraft } from '@/lib/inspection-drafts';

type DonationRecord = {
  id: number;
  title: string;
  status: string;
  remaining_pickups: number;
  reserved_claims_count: number;
  max_pickups: number;
  zone?: {
    name: string;
  };
  pickup_address?: string | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
};

type ClaimRecord = {
  id: number;
  status: string;
  verification_code?: string;
  reserved_at: string;
  pickup_window_start?: string;
  family?: {
    name: string;
    email: string;
    household_size?: number;
  };
};

const STATUSES = ['reserved', 'ready', 'collected', 'cancelled'] as const;

const SCAN_POLL_INTERVAL_MS = 1500;
const SCAN_POLL_ATTEMPTS = 8;

const DEFAULT_MAP_REGION = {
  latitude: 37.773972,
  longitude: -122.431297,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
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
  border: string;
  success: string;
  warning: string;
};

export default function DonorsDonate() {
  const auth = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const palette: Palette = useMemo(() => {
    const base = Colors[colorScheme];
    return {
      ...base,
      card: colorScheme === 'dark' ? '#1F2430' : '#F8FAFF',
      secondaryText: colorScheme === 'dark' ? '#9BA1A6' : '#5D6470',
      border: colorScheme === 'dark' ? '#2D3142' : '#E2E8F0',
      success: '#0F9D58',
      warning: '#F59E0B',
    };
  }, [colorScheme]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [autoRoute, setAutoRoute] = useState<string>('Tap “Auto route” to get a smart pantry match.');
  const [activeDonation, setActiveDonation] = useState<DonationRecord | null>(null);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [managerVisible, setManagerVisible] = useState(false);
  const [scanHint, setScanHint] = useState<string>('Smart scanner ready — aim at crates or invoices.');
  const mapSupported = useMemo(() => isMapboxAvailable(), []);
  const mapRef = useRef<MapboxMapHandle | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [pickupLatitude, setPickupLatitude] = useState('');
  const [pickupLongitude, setPickupLongitude] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [form, setForm] = useState({
    title: '',
    category: 'produce',
    freshness_notes: '',
    distance_miles: '2',
    max_pickups: '10',
    pickup_window_hours: '6',
  });

  const resetForm = useCallback(() => {
    setForm({
      title: '',
      category: 'produce',
      freshness_notes: '',
      distance_miles: '2',
      max_pickups: '10',
      pickup_window_hours: '6',
    });
    setAutoRoute('Tap “Auto route” to get a smart pantry match.');
    setPickupLatitude('');
    setPickupLongitude('');
    setPickupAddress('');
    setScanHint('Smart scanner ready — aim at crates or invoices.');
  }, []);

  const loadDonations = useCallback(async () => {
    if (!auth.token) return;
    setLoading(true);
    try {
      const res = await getDonorDonations(auth.token);
      setDonations(res?.donations ?? []);
      setCategories(res?.meta?.categories ?? []);
    } catch (error) {
      console.warn('Failed to load donor donations', error);
    } finally {
      setLoading(false);
    }
  }, [auth.token]);

  useEffect(() => {
    loadDonations();
  }, [loadDonations]);

  const handleMapReady = useCallback(() => setMapReady(true), []);

  const pickupLocation = useMemo(() => {
    const lat = Number(pickupLatitude);
    const lon = Number(pickupLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    return { latitude: lat, longitude: lon };
  }, [pickupLatitude, pickupLongitude]);

  const mapRegion = useMemo(() => {
    if (pickupLocation) {
      return {
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      };
    }
    return DEFAULT_MAP_REGION;
  }, [pickupLocation]);

  const mapMarkers = useMemo<MapboxMarker[]>(() => {
    if (!pickupLocation) {
      return [];
    }
    return [
      {
        id: 'pickup-location',
        coordinate: pickupLocation,
        title: pickupAddress || 'Pickup pin',
        color: palette.tint,
        selected: true,
      },
    ];
  }, [palette.tint, pickupAddress, pickupLocation]);

  useEffect(() => {
    if (!mapSupported || !mapReady || !mapRef.current) {
      return;
    }
    mapRef.current.animateToRegion(mapRegion, 450);
  }, [mapReady, mapRegion, mapSupported]);

  const handleMapPress = useCallback((coordinate: { latitude: number; longitude: number }) => {
    setPickupLatitude(coordinate.latitude.toFixed(6));
    setPickupLongitude(coordinate.longitude.toFixed(6));
  }, []);

  const handleClearLocation = useCallback(() => {
    setPickupLatitude('');
    setPickupLongitude('');
    setPickupAddress('');
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    try {
      setLocating(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission || permission.status !== 'granted') {
        Alert.alert('Location access needed', 'Enable location permissions to drop a pin automatically.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = position.coords;
      setPickupLatitude(latitude.toFixed(6));
      setPickupLongitude(longitude.toFixed(6));
      if (!pickupAddress.trim()) {
        setPickupAddress('Current location');
      }
    } catch (error) {
      console.warn('Failed to fetch current location', error);
      Alert.alert('Location unavailable', 'Could not determine your current location right now.');
    } finally {
      setLocating(false);
    }
  }, [pickupAddress]);

  const applyInspectionAnalysis = useCallback((analysis: Record<string, any> | null | undefined) => {
    const safeAnalysis = analysis ?? {};
    const itemName = safeText(safeAnalysis?.food_item?.value);
    const normalizedType = safeText(safeAnalysis?.food_type?.value).toLowerCase();
    const mappedCategory = resolveCategory(normalizedType);
    const freshnessValue = typeof safeAnalysis?.freshness_rating?.value === 'number'
      ? Math.round(Number(safeAnalysis.freshness_rating.value))
      : null;
    const expiryValue = safeText(safeAnalysis?.expiry_date?.value);
    const freshnessSummary = buildFreshnessSummary(freshnessValue, expiryValue);

    setForm((prev) => ({
      ...prev,
      title: titleize(itemName) || prev.title || 'Community Pantry Donation',
      category: mappedCategory || prev.category,
      freshness_notes: freshnessSummary || prev.freshness_notes,
    }));
    setScanHint('Gemini scan applied — freshness & expiry pre-filled.');
  }, []);

  const applyInspectionDraft = useCallback((draft: ReturnType<typeof consumePendingInspectionDraft>) => {
    if (!draft) return;
    applyInspectionAnalysis(draft.analysis);
  }, [applyInspectionAnalysis]);

  useFocusEffect(
    useCallback(() => {
      const draft = consumePendingInspectionDraft();
      if (draft) {
        applyInspectionDraft(draft);
      }
    }, [applyInspectionDraft]),
  );

  const waitForInspectionResult = useCallback(
    async (inspectionId: number): Promise<FoodInspectionRecord | null> => {
      if (!auth.token) return null;
      for (let attempt = 0; attempt < SCAN_POLL_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, SCAN_POLL_INTERVAL_MS));
        }
        try {
          const records = await getFoodInspections(auth.token);
          if (Array.isArray(records)) {
            const match = (records as FoodInspectionRecord[]).find((record) => record.id === inspectionId) || null;
            if (match && (match.status === 'succeeded' || match.status === 'failed')) {
              return match;
            }
          }
        } catch (error) {
          console.warn('Food inspection poll failed', error);
        }
      }
      return null;
    },
    [auth.token],
  );

  const processScanAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset | null | undefined) => {
      if (!auth.token) {
        Alert.alert('Sign in required', 'Log in again to scan crates with AI.');
        return;
      }
      if (scanning || !asset?.uri) {
        return;
      }

      setScanning(true);
      setScanHint('Uploading photo for AI analysis...');
      try {
        const created = (await uploadFoodInspection(auth.token, asset as any)) as FoodInspectionRecord | undefined;
        if (!created?.id) {
          throw new Error('Upload did not return a scan record.');
        }

        if (created.status === 'succeeded') {
          applyInspectionAnalysis(created.analysis);
          return;
        }

        setScanHint('Analyzing photo... this can take a few seconds.');
        const resolved = await waitForInspectionResult(created.id);
        if (resolved?.status === 'succeeded') {
          applyInspectionAnalysis(resolved.analysis);
          return;
        }

        if (resolved?.status === 'failed') {
          const message = resolved.error_message || 'Image analysis failed. Please try again.';
          setScanHint('Scan failed - try another angle or better lighting.');
          Alert.alert('Scan failed', message);
          return;
        }

        setScanHint('Scan timed out - try again in a moment.');
        Alert.alert('Scan timed out', 'The analysis is taking longer than expected. Try scanning the crates again.');
      } catch (error: any) {
        console.warn('Donation scan failed', error);
        const message =
          error?.body?.detail ||
          error?.body?.error ||
          error?.message ||
          'Image analysis failed. Please try again.';
        setScanHint('Scan failed - try another angle or better lighting.');
        Alert.alert('Scan failed', message);
      } finally {
        setScanning(false);
      }
    },
    [applyInspectionAnalysis, auth.token, scanning, waitForInspectionResult],
  );

  const captureScanPhoto = useCallback(async () => {
    if (scanning) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow camera access to capture a fresh photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
        exif: true,
      });

      if (!result.canceled && result.assets?.length) {
        await processScanAsset(result.assets[0]);
      }
    } catch (error: any) {
      console.warn('Camera capture failed', error);
      const message = error?.message || 'Could not access the camera.';
      Alert.alert('Camera unavailable', message);
    }
  }, [processScanAsset, scanning]);

  const pickScanPhoto = useCallback(async () => {
    if (scanning) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to analyze your food images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
        exif: true,
      });

      if (!result.canceled && result.assets?.length) {
        await processScanAsset(result.assets[0]);
      }
    } catch (error: any) {
      console.warn('Opening media library failed', error);
      const message = error?.message || 'Could not open the photo library.';
      Alert.alert('Photo library unavailable', message);
    }
  }, [processScanAsset, scanning]);

  const handleScan = useCallback(() => {
    if (!auth.token) {
      Alert.alert('Sign in required', 'Log in again to scan crates with AI.');
      return;
    }
    if (scanning) {
      return;
    }

    const buttons = [
      { text: 'Cancel', style: 'cancel' as const },
      { text: 'Take Photo', onPress: () => captureScanPhoto() },
      { text: 'Photo Library', onPress: () => pickScanPhoto() },
    ];
    const orderedButtons = Platform.OS === 'android' ? [buttons[0], buttons[2], buttons[1]] : buttons;
    Alert.alert('Scan crates', 'Take a photo or choose one to auto-fill freshness details.', orderedButtons);
  }, [auth.token, captureScanPhoto, pickScanPhoto, scanning]);

  const onSubmit = useCallback(async () => {
    if (!auth.token) return;
    if (!form.title.trim()) {
      Alert.alert('Add a title', 'Give this event a name recipients will recognize.');
      return;
    }

    const latValue = Number(pickupLatitude);
    const lonValue = Number(pickupLongitude);
    if (!Number.isFinite(latValue) || !Number.isFinite(lonValue)) {
      Alert.alert('Add coordinates', 'Enter both latitude and longitude or drop a pin on the map.');
      return;
    }
    if (latValue < -90 || latValue > 90 || lonValue < -180 || lonValue > 180) {
      Alert.alert('Invalid coordinates', 'Latitude must be between -90 and 90, longitude between -180 and 180.');
      return;
    }

    setSubmitting(true);
    try {
      const rawPickups = Number(form.max_pickups);
      const maxPickups = Math.max(1, Number.isFinite(rawPickups) ? Math.round(rawPickups) : 1);
      const rawHours = Number(form.pickup_window_hours);
      const pickupHours = Math.max(2, Number.isFinite(rawHours) ? Math.round(rawHours) : 2);
      const rawMiles = Number.parseFloat(form.distance_miles);
      const distanceMiles = Number.isFinite(rawMiles) ? Number.parseFloat(rawMiles.toFixed(1)) : 0;
      const now = new Date();
      const until = new Date(now.getTime() + pickupHours * 60 * 60 * 1000);

      await createDonorDonation(auth.token, {
        title: form.title.trim(),
        category: form.category,
        freshness_notes: form.freshness_notes.trim(),
        distance_miles: Math.max(0, distanceMiles),
        available_from: now.toISOString(),
        available_until: until.toISOString(),
        max_pickups: maxPickups,
        status: 'available',
        pickup_address: pickupAddress.trim(),
        pickup_latitude: latValue,
        pickup_longitude: lonValue,
      });
      await loadDonations();
      resetForm();
      Alert.alert('Donation published', 'Families can start reserving pickup slots now.');
    } catch (error: any) {
      console.warn('Failed to create donation', error);
      Alert.alert('Unable to post donation', error?.body?.detail || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [auth.token, form, pickupAddress, pickupLatitude, pickupLongitude, loadDonations, resetForm]);

  const handleAutoRoute = useCallback(async () => {
    if (!auth.token) return;
    try {
      const res = await getDonorAutoRoute(auth.token, activeDonation?.id ?? null);
      setAutoRoute(
        `Route ${res.origin} → ${res.destination} · ${res.estimated_minutes} min \n${res.instructions.join('\n')}`,
      );
    } catch (error) {
      console.warn('Auto route failed', error);
      setAutoRoute('Could not fetch route suggestions right now.');
    }
  }, [auth.token, activeDonation?.id]);

  const openManager = useCallback(
    async (donation: DonationRecord) => {
      if (!auth.token) return;
      setActiveDonation(donation);
      setManagerVisible(true);
      setClaimsLoading(true);
      try {
        const res = await getDonorDonationClaims(auth.token, donation.id);
        setClaims(res?.claims ?? []);
      } catch (error) {
        console.warn('Failed to load claims', error);
        Alert.alert('Unable to load reservations', 'Please try again soon.');
      } finally {
        setClaimsLoading(false);
      }
    },
    [auth.token],
  );

  const updateClaimStatus = useCallback(
    async (claimId: number, nextStatus: string) => {
      if (!auth.token) return;
      try {
        await updateDonorClaim(auth.token, claimId, { status: nextStatus });
        if (activeDonation) {
          const res = await getDonorDonationClaims(auth.token, activeDonation.id);
          setClaims(res?.claims ?? []);
          await loadDonations();
        }
      } catch (error) {
        console.warn('Failed to update claim', error);
        Alert.alert('Update failed', 'Could not change reservation status.');
      }
    },
    [auth.token, activeDonation, loadDonations],
  );

  const adjustPickupLimit = useCallback(
    async (donation: DonationRecord, delta: number) => {
      if (!auth.token) return;
      const next = Math.max(1, donation.max_pickups + delta);
      try {
        await updateDonorDonation(auth.token, donation.id, { max_pickups: next });
        await loadDonations();
        if (managerVisible && activeDonation?.id === donation.id) {
          const res = await getDonorDonationClaims(auth.token, donation.id);
          setClaims(res?.claims ?? []);
        }
      } catch (error) {
        console.warn('Failed to adjust pickups', error);
        Alert.alert('Update failed', 'Unable to change pickup limit right now.');
      }
    },
    [auth.token, loadDonations, managerVisible, activeDonation],
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: palette.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.heading, { color: palette.text }]}>Launch a donation</Text>
      <Text style={[styles.subheading, { color: palette.secondaryText }]}>Scan items, auto-tag freshness, and publish pickups instantly.</Text>

      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Smart scanner</Text>
          <TouchableOpacity
            style={[styles.iconButton, { opacity: scanning ? 0.6 : 1 }]}
            onPress={handleScan}
            disabled={scanning}
            activeOpacity={0.85}
          >
            {scanning ? (
              <ActivityIndicator size="small" color={palette.tint} />
            ) : (
              <Ionicons name="scan" size={18} color={palette.tint} />
            )}
            <Text style={[styles.iconButtonText, { color: palette.tint }]}>{scanning ? 'Scanning...' : 'Scan crates'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.helper, { color: palette.secondaryText }]}>{scanHint}</Text>
        <View style={styles.fieldGroup}>
          <Label text="Donation title" palette={palette} />
          <TextInput
            value={form.title}
            onChangeText={(text) => setForm((prev) => ({ ...prev, title: text }))}
            placeholder="Ex: Harborview produce share"
            placeholderTextColor={palette.secondaryText}
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Label text="Category" palette={palette} />
          <View style={styles.tagsRow}>
            {categories.map((cat) => {
              const isActive = form.category === cat.value;
              return (
                <TouchableOpacity
                  key={cat.value}
                  onPress={() => setForm((prev) => ({ ...prev, category: cat.value }))}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isActive ? palette.tint : 'transparent',
                      borderColor: isActive ? palette.tint : palette.border,
                    },
                  ]}>
                  <Text style={[styles.chipLabel, { color: isActive ? '#fff' : palette.secondaryText }]}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={[styles.fieldRow, { gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Label text="Pickup slots" palette={palette} />
            <TextInput
              value={form.max_pickups}
              keyboardType="numeric"
              onChangeText={(text) => setForm((prev) => ({ ...prev, max_pickups: text }))}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label text="Window (hrs)" palette={palette} />
            <TextInput
              value={form.pickup_window_hours}
              keyboardType="numeric"
              onChangeText={(text) => setForm((prev) => ({ ...prev, pickup_window_hours: text }))}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </View>
        </View>

        <View style={[styles.fieldRow, { gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Label text="Distance (mi)" palette={palette} />
            <TextInput
              value={form.distance_miles}
              keyboardType="decimal-pad"
              onChangeText={(text) => setForm((prev) => ({ ...prev, distance_miles: text }))}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Label text="Freshness notes" palette={palette} />
            <TextInput
              value={form.freshness_notes}
              onChangeText={(text) => setForm((prev) => ({ ...prev, freshness_notes: text }))}
              placeholder="Highlight prep time, storage needs"
              placeholderTextColor={palette.secondaryText}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Label text="Pickup location" palette={palette} />
          <Text style={[styles.helper, { color: palette.secondaryText }]}>Drop a pin, type coordinates, or add notes so volunteers know exactly where to meet you.</Text>
          {mapSupported ? (
            <View style={[styles.mapWrapper, { borderColor: palette.border, backgroundColor: palette.background }]}> 
              <MapboxMap
                ref={mapRef}
                style={styles.mapView}
                initialRegion={mapRegion}
                markers={mapMarkers}
                onMapReady={handleMapReady}
                onMapPress={handleMapPress}
              />
            </View>
          ) : (
            <View style={[styles.mapFallback, { borderColor: palette.border, backgroundColor: palette.card }]}> 
              <Ionicons name="map" size={18} color={palette.secondaryText} style={{ marginBottom: 8 }} />
              <Text style={[styles.mapFallbackText, { color: palette.secondaryText }]}>Map preview unavailable — type coordinates below so volunteers can navigate to you.</Text>
            </View>
          )}
          <Text style={[styles.mapCaption, { color: palette.secondaryText }]}> 
            {pickupLocation
              ? 'Pin ready — volunteers will see the meetup spot on their route.'
              : 'No map pin yet — tap the map or use “Use current location.”'}
          </Text>
          <View style={styles.mapActions}>
            <TouchableOpacity
              style={[
                styles.mapActionButton,
                {
                  borderColor: palette.border,
                  opacity: locating ? 0.6 : 1,
                },
              ]}
              onPress={handleUseCurrentLocation}
              disabled={locating}
              activeOpacity={0.85}
            >
              {locating ? (
                <ActivityIndicator size="small" color={palette.tint} />
              ) : (
                <Ionicons name="locate" size={16} color={palette.tint} />
              )}
              <Text style={[styles.mapActionText, { color: locating ? palette.secondaryText : palette.tint }]}>Use current location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.mapActionButton,
                {
                  borderColor: palette.border,
                  opacity: pickupLocation || pickupAddress ? 1 : 0.55,
                },
              ]}
              onPress={handleClearLocation}
              disabled={!pickupLocation && !pickupAddress && !pickupLatitude && !pickupLongitude}
              activeOpacity={0.85}
            >
              <Ionicons name="close-outline" size={16} color={palette.secondaryText} />
              <Text style={[styles.mapActionText, { color: palette.secondaryText }]}>Clear pin</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={pickupAddress}
            onChangeText={setPickupAddress}
            placeholder="Dock, suite, or helpful delivery notes"
            placeholderTextColor={palette.secondaryText}
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
        </View>

        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: palette.tint }]} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryLabel}>Publish donation</Text>}
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Auto route</Text>
          <TouchableOpacity style={styles.iconButton} onPress={handleAutoRoute}>
            <Ionicons name="navigate" size={18} color={palette.tint} />
            <Text style={[styles.iconButtonText, { color: palette.tint }]}>Route suggestion</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.helper, { color: palette.secondaryText, lineHeight: 18 }]}>{autoRoute}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Active events</Text>
          <Text style={[styles.badge, { backgroundColor: 'rgba(99,102,241,0.12)', color: palette.tint }]}>{donations.length}</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={palette.tint} />
        ) : donations.length === 0 ? (
          <Text style={[styles.helper, { color: palette.secondaryText }]}>No live donations yet — publish your first event above.</Text>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={donations}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => openManager(item)}
                activeOpacity={0.85}
                style={[styles.donationRow, { borderColor: palette.border }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.donationTitle, { color: palette.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.donationMeta, { color: palette.secondaryText }]}>
                    {item.reserved_claims_count} reserved · {item.remaining_pickups} slots left
                  </Text>
                </View>
                <View style={styles.donationActions}>
                  <TouchableOpacity style={[styles.circleBtn, { borderColor: palette.border }]} onPress={() => adjustPickupLimit(item, 1)}>
                    <Ionicons name="add" size={16} color={palette.tint} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.circleBtn, { borderColor: palette.border }]} onPress={() => adjustPickupLimit(item, -1)}>
                    <Ionicons name="remove" size={16} color={palette.tint} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={18} color={palette.secondaryText} />
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          />
        )}
      </View>

      <ReservationManager
        visible={managerVisible}
        onClose={() => setManagerVisible(false)}
        loading={claimsLoading}
        donation={activeDonation}
        claims={claims}
        palette={palette}
        onUpdateStatus={updateClaimStatus}
      />
    </ScrollView>
  );
}

function ReservationManager({
  visible,
  onClose,
  loading,
  donation,
  claims,
  palette,
  onUpdateStatus,
}: {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  donation: DonationRecord | null;
  claims: ClaimRecord[];
  palette: Palette;
  onUpdateStatus: (claimId: number, status: string) => Promise<void>;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: palette.background }]}> 
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={22} color={palette.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: palette.text }]}>{donation?.title || 'Reservations'}</Text>
          <Text style={[styles.modalSubtitle, { color: palette.secondaryText }]}>
            {donation ? `${donation.reserved_claims_count} reserved · ${donation.remaining_pickups} remaining` : ''}
          </Text>
        </View>

        {loading ? (
          <View style={styles.modalLoader}>
            <ActivityIndicator size="large" color={palette.tint} />
          </View>
        ) : (
          <FlatList
            data={claims}
            keyExtractor={(item) => String(item.id)}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, gap: 16 }}
            renderItem={({ item }) => (
              <View style={[styles.claimCard, { borderColor: palette.border, backgroundColor: palette.card }]}> 
                <View style={styles.claimHeader}>
                  <View>
                    <Text style={[styles.claimTitle, { color: palette.text }]}>{item.family?.name ?? item.family?.email}</Text>
                    <Text style={[styles.claimMeta, { color: palette.secondaryText }]}>Code {item.verification_code || '—'}</Text>
                  </View>
                  <StatusBadge status={item.status} palette={palette} />
                </View>
                <View style={styles.statusRow}>
                  {STATUSES.map((statusOption) => {
                    const active = item.status === statusOption;
                    return (
                      <TouchableOpacity
                        key={statusOption}
                        onPress={() => onUpdateStatus(item.id, statusOption)}
                        style={[
                          styles.statusChip,
                          {
                            backgroundColor: active ? palette.tint : 'transparent',
                            borderColor: active ? palette.tint : palette.border,
                          },
                        ]}>
                        <Text style={[styles.statusChipText, { color: active ? '#fff' : palette.secondaryText }]}>
                          {statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.claimMeta, { color: palette.secondaryText }]}>Reserved {new Date(item.reserved_at).toLocaleString()}</Text>
              </View>
            )}
            ListEmptyComponent={() => (
              <Text style={[styles.helper, { color: palette.secondaryText, textAlign: 'center' }]}>
                No reservations yet — share this event with nearby families.
              </Text>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

function Label({ text, palette }: { text: string; palette: Palette }) {
  return <Text style={[styles.label, { color: palette.secondaryText }]}>{text}</Text>;
}

function StatusBadge({ status, palette }: { status: string; palette: Palette }) {
  const config: Record<string, { color: string; bg: string; label: string }> = {
    reserved: { color: '#D97706', bg: '#FEF3C7', label: 'Reserved' },
    ready: { color: '#2563EB', bg: '#DBEAFE', label: 'Ready' },
    collected: { color: '#4B5563', bg: '#E5E7EB', label: 'Collected' },
    cancelled: { color: '#DC2626', bg: '#FEE2E2', label: 'Cancelled' },
  };
  const { color, bg, label } = config[status] || { color: palette.tint, bg: 'rgba(99,102,241,0.12)', label: status };
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}> 
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
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
    paddingBottom: 48,
    gap: 18,
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(10,126,164,0.08)',
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  helper: {
    fontSize: 13,
    fontWeight: '500',
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapWrapper: {
    height: 220,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 8,
  },
  mapView: {
    flex: 1,
  },
  mapFallback: {
    height: 220,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  mapFallbackText: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
  },
  mapCaption: {
    fontSize: 12,
    marginBottom: 8,
  },
  mapActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  mapActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  mapActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '600',
  },
  donationRow: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  donationTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  donationMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  donationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 4,
  },
  modalClose: {
    alignSelf: 'flex-start',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  claimHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  claimTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  claimMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalContainerInner: {
    flex: 1,
  },
});

function safeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return '';
}

function titleize(value: unknown): string {
  const text = safeText(value);
  if (!text) return '';
  return text
    .split(/[\s_/+-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function resolveCategory(raw: string): string {
  const value = safeText(raw).toLowerCase();
  if (!value) return 'produce';

  if (/produce|vegetable|greens|fruit|salad|herb/.test(value)) {
    return 'produce';
  }
  if (/dairy|cheese|yogurt|milk|cream|butter/.test(value)) {
    return 'dairy';
  }
  if (/bread|bakery|bagel|loaf|pastry|bun/.test(value)) {
    return 'bread';
  }
  if (/drink|juice|beverage|soda|tea|coffee|smoothie/.test(value)) {
    return 'beverage';
  }
  if (/meal|prepared|cooked|kit|entree|protein|meat|poultry|fish|seafood|hot/.test(value)) {
    return 'prepared';
  }
  if (/pantry|shelf|dry|grain|rice|beans|pasta|cereal|staple|canned|legume/.test(value)) {
    return 'pantry';
  }

  return 'produce';
}

function buildFreshnessSummary(freshnessScore: number | null, expiryLabel: string): string {
  const summary: string[] = [];

  if (typeof freshnessScore === 'number' && !Number.isNaN(freshnessScore)) {
    if (freshnessScore >= 85) {
      summary.push('High freshness — ideal for distribution');
    } else if (freshnessScore >= 60) {
      summary.push('Good freshness — refrigerate and share soon');
    } else if (freshnessScore >= 40) {
      summary.push('Moderate freshness — prioritize for next pickups');
    } else {
      summary.push('Low freshness — use quickly or inspect manually');
    }
  }

  const expiryText = safeText(expiryLabel);
  if (expiryText) {
    summary.push(`Expires ${expiryText}`);
  }

  return summary.join(' · ');
}
