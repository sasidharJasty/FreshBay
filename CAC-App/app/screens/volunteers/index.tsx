import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ActivityIndicator,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	Linking,
	Platform,
	Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { acceptVolunteerTask, getVolunteerRoutes } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MapboxMap, isMapboxAvailable } from '@/components/mapbox-map';
import type { MapboxMapHandle, MapboxMarker, MapboxPolyline } from '@/components/mapbox-map';

type Coordinate = {
	latitude: number;
	longitude: number;
};

type VolunteerProfile = {
	vehicle_type?: string | null;
	efficiency_score?: number | null;
	preferred_radius_miles?: number | null;
	completed_routes?: number | null;
};

type VolunteerStop = {
	id: string;
	task_id: number;
	type: 'pickup' | 'dropoff';
	label: string;
	status: string;
	sequence: number;
	eta_minutes?: number;
	coordinates?: Coordinate;
};

type VolunteerRouteSummary = {
	total_distance_miles: number;
	eta_minutes: number;
	efficiency_score: number;
	last_updated?: string | null;
};

type VolunteerTask = {
	id: number;
	title: string;
	summary?: string;
	status?: string;
	urgency?: string;
	load_size?: string;
	distance_miles?: number;
	estimated_minutes?: number;
	pickup_address?: string;
	dropoff_address?: string;
	pickup_latitude?: number;
	pickup_longitude?: number;
	dropoff_latitude?: number;
	dropoff_longitude?: number;
};

type VolunteerRoute = {
	summary: VolunteerRouteSummary;
	polyline: Coordinate[];
	stops: VolunteerStop[];
	tasks: VolunteerTask[];
};

type MapRegion = {
	latitude: number;
	longitude: number;
	latitudeDelta: number;
	longitudeDelta: number;
};

const DEFAULT_REGION: MapRegion = {
	latitude: 37.773972,
	longitude: -122.431297,
	latitudeDelta: 0.25,
	longitudeDelta: 0.25,
};

function toNumber(value: unknown, fallback = 0): number {
	if (value === null || value === undefined) return fallback;
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
	if (value === null || value === undefined) return undefined;
	const num = Number(value);
	return Number.isFinite(num) ? num : undefined;
}

function computeRegion(points: Coordinate[]): MapRegion {
	if (!points.length) return DEFAULT_REGION;
	const lats = points.map((p) => p.latitude);
	const lngs = points.map((p) => p.longitude);
	const minLat = Math.min(...lats);
	const maxLat = Math.max(...lats);
	const minLng = Math.min(...lngs);
	const maxLng = Math.max(...lngs);
	const latitude = (minLat + maxLat) / 2;
	const longitude = (minLng + maxLng) / 2;
	const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.08);
	const longitudeDelta = Math.max((maxLng - minLng) * 1.4, 0.08);
	return { latitude, longitude, latitudeDelta, longitudeDelta };
}

function formatLastUpdatedLabel(dateInput?: string | null): string {
	if (!dateInput) return 'Updated just now';
	const parsed = new Date(dateInput);
	if (Number.isNaN(parsed.getTime())) return 'Updated just now';

	const diffMs = Date.now() - parsed.getTime();
	if (diffMs < 0) return 'Updated just now';
	if (diffMs < 60_000) return 'Updated just now';

	const diffMinutes = Math.round(diffMs / 60_000);
	if (diffMinutes < 60) return `Updated ${diffMinutes} min ago`;

	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours < 24) {
		return `Updated ${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
	}

	return `Updated ${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
	})}`;
}

function sanitizeCoordinate(point: any): Coordinate | null {
	if (!point || typeof point !== 'object') return null;
	const latitude = toNumber(point.latitude ?? point.lat, NaN);
	const longitude = toNumber(point.longitude ?? point.lng, NaN);
	if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
	return { latitude, longitude };
}

function sanitizePolyline(points: any): Coordinate[] {
	if (!Array.isArray(points)) return [];
	return points.map(sanitizeCoordinate).filter((coord): coord is Coordinate => Boolean(coord));
}

function sanitizeStops(stops: any): VolunteerStop[] {
	if (!Array.isArray(stops)) return [];
	return stops
		.map((stop) => {
			if (!stop) return null;
			const idRaw = stop.id ?? stop.stop_id ?? stop.pk;
			if (idRaw === undefined || idRaw === null) return null;
			const id = String(idRaw);
			const taskId = toNumber(stop.task_id ?? stop.task ?? 0, 0);
			const type = typeof stop.type === 'string' && stop.type.toLowerCase() === 'dropoff' ? 'dropoff' : 'pickup';
			const label = typeof stop.label === 'string' && stop.label.trim() ? stop.label : 'Route stop';
			const status = typeof stop.status === 'string' ? stop.status : 'assigned';
			const sequence = toNumber(stop.sequence, 0);
			const eta = stop.eta_minutes != null ? toNumber(stop.eta_minutes, NaN) : NaN;
			const coordinates = sanitizeCoordinate(stop.coordinates);

			return {
				id,
				task_id: taskId,
				type,
				label,
				status,
				sequence,
				eta_minutes: Number.isFinite(eta) ? eta : undefined,
				coordinates: coordinates ?? undefined,
			} satisfies VolunteerStop;
		})
		.filter(Boolean) as VolunteerStop[];
}

function sanitizeTasks(tasks: any): VolunteerTask[] {
	if (!Array.isArray(tasks)) return [];
	return tasks
		.map((task) => {
			if (!task) return null;
			const id = toNumber(task.id, NaN);
			if (!Number.isFinite(id) || id <= 0) return null;
			const urgency = typeof task.urgency === 'string' ? task.urgency.toLowerCase() : undefined;
			const pickupNode = task.pickup_location ?? task.pickup ?? task.pickup_coordinates;
			const dropoffNode = task.dropoff_location ?? task.dropoff ?? task.dropoff_coordinates;
			const pickupLatitude = toOptionalNumber(task.pickup_latitude ?? task.pickup_lat ?? pickupNode?.latitude ?? pickupNode?.lat);
			const pickupLongitude = toOptionalNumber(task.pickup_longitude ?? task.pickup_lng ?? pickupNode?.longitude ?? pickupNode?.lng);
			const dropoffLatitude = toOptionalNumber(task.dropoff_latitude ?? task.dropoff_lat ?? dropoffNode?.latitude ?? dropoffNode?.lat);
			const dropoffLongitude = toOptionalNumber(task.dropoff_longitude ?? task.dropoff_lng ?? dropoffNode?.longitude ?? dropoffNode?.lng);
			return {
				id,
				title: typeof task.title === 'string' ? task.title : 'Volunteer task',
				summary: typeof task.summary === 'string' ? task.summary : undefined,
				status: typeof task.status === 'string' ? task.status : undefined,
				urgency,
				load_size: typeof task.load_size === 'string' ? task.load_size : undefined,
				distance_miles: task.distance_miles != null ? toNumber(task.distance_miles, NaN) : undefined,
				estimated_minutes: task.estimated_minutes != null ? toNumber(task.estimated_minutes, NaN) : undefined,
				pickup_address: typeof task.pickup_address === 'string' ? task.pickup_address : undefined,
				dropoff_address: typeof task.dropoff_address === 'string' ? task.dropoff_address : undefined,
				pickup_latitude: pickupLatitude,
				pickup_longitude: pickupLongitude,
				dropoff_latitude: dropoffLatitude,
				dropoff_longitude: dropoffLongitude,
			} satisfies VolunteerTask;
		})
		.filter(Boolean) as VolunteerTask[];
}

function sanitizeProfile(raw: any): VolunteerProfile | null {
	if (!raw || typeof raw !== 'object') return null;
	const vehicleType = typeof raw.vehicle_type === 'string' ? raw.vehicle_type : null;
	const efficiencyScore = raw.efficiency_score != null ? toNumber(raw.efficiency_score, NaN) : null;
	const preferredRadius = raw.preferred_radius_miles != null ? toNumber(raw.preferred_radius_miles, NaN) : null;
	const completedRoutes = raw.completed_routes != null ? toNumber(raw.completed_routes, NaN) : null;

	return {
		vehicle_type: vehicleType,
		efficiency_score: Number.isFinite(efficiencyScore) ? efficiencyScore : null,
		preferred_radius_miles: Number.isFinite(preferredRadius) ? preferredRadius : null,
		completed_routes: Number.isFinite(completedRoutes) ? completedRoutes : null,
	};
}

function normalizeVolunteerRoute(raw: any): VolunteerRoute {
	const summary = raw?.summary ?? {};
	const distance = toNumber(summary.total_distance_miles, 0);
	const eta = toNumber(summary.eta_minutes, 0);
	const eff = toNumber(summary.efficiency_score, 0);

	return {
		summary: {
			total_distance_miles: Number.isFinite(distance) ? distance : 0,
			eta_minutes: Number.isFinite(eta) ? eta : 0,
			efficiency_score: Number.isFinite(eff) ? eff : 0,
			last_updated: typeof summary.last_updated === 'string' ? summary.last_updated : null,
		},
		polyline: sanitizePolyline(raw?.polyline),
		stops: sanitizeStops(raw?.stops),
		tasks: sanitizeTasks(raw?.tasks),
	};
}

export default function VolunteersRoutes() {
	const { token } = useAuth();
	const colorScheme = useColorScheme() ?? 'light';
	const palette = Colors[colorScheme as 'light' | 'dark'];
	const styles = useMemo(() => createStyles(palette), [palette]);

	const mapSupported = isMapboxAvailable();
	const mapRef = useRef<MapboxMapHandle | null>(null);
	const [mapReady, setMapReady] = useState(false);
	const handleMapReady = useCallback(() => setMapReady(true), []);

	useEffect(() => {
		if (!mapSupported) {
			setMapReady(false);
		}
	}, [mapSupported]);

	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [profile, setProfile] = useState<VolunteerProfile | null>(null);
	const [route, setRoute] = useState<VolunteerRoute | null>(null);
	const [suggestions, setSuggestions] = useState<VolunteerTask[]>([]);

	const fetchRoutes = useCallback(
		async (options: { useLoading?: boolean } = {}) => {
			if (!token) {
				setProfile(null);
				setRoute(null);
				setSuggestions([]);
				setLoading(false);
				setRefreshing(false);
				setMapReady(false);
				return;
			}

			if (options.useLoading !== false) {
				setLoading(true);
			}

			try {
				const res = await getVolunteerRoutes(token);
				setProfile(sanitizeProfile(res?.profile));
				setRoute(res?.route ? normalizeVolunteerRoute(res.route) : null);
				setSuggestions(sanitizeTasks(res?.suggestions));
			} catch (error) {
				console.warn('Unable to load volunteer routes', error);
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[token]
	);

	useEffect(() => {
		fetchRoutes();
	}, [fetchRoutes]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		fetchRoutes({ useLoading: false });
	}, [fetchRoutes]);

	const openDirectionsTo = useCallback((lat?: number | null, lng?: number | null, label?: string) => {
			if (lat == null || lng == null) {
				Alert.alert('Directions unavailable', 'This stop does not have coordinates.');
				return;
			}
			const latitude = Number(lat);
			const longitude = Number(lng);
			const labelEncoded = encodeURIComponent(label || 'Destination');
			const latLng = `${latitude},${longitude}`;
			const url = Platform.OS === 'ios' ? `maps://?q=${labelEncoded}@${latLng}` : `geo:0,0?q=${latLng}(${labelEncoded})`;
			const universal = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
			Linking.openURL(url).catch(() => Linking.openURL(universal)).catch((err) => console.warn('Directions error', err));
		}, []);
	const mapCoordinates = useMemo(() => {
		if (!route) return [] as Coordinate[];
		if (route.polyline.length) return route.polyline;
		return route.stops.map((stop) => stop.coordinates).filter((coord): coord is Coordinate => Boolean(coord));
	}, [route]);

	const initialRegion = useMemo(() => computeRegion(mapCoordinates), [mapCoordinates]);

	const mapPolylines: MapboxPolyline[] = useMemo(() => {
		if (!route?.polyline?.length) {
			return [];
		}
		return [
			{
				id: 'volunteer-route',
				coordinates: route.polyline,
				color: palette.tint,
				width: 5,
			},
		];
	}, [palette.tint, route?.polyline]);

	const { markerList, stopLookup } = useMemo(() => {
		const markers: MapboxMarker[] = [];
		const lookup: Record<string, VolunteerStop> = {};
		(route?.stops ?? []).forEach((stop) => {
			if (!stop?.coordinates) return;
			lookup[stop.id] = stop;
			markers.push({
				id: stop.id,
				coordinate: stop.coordinates,
				title: stop.label,
				subtitle: `${stop.type === 'pickup' ? 'Pickup' : 'Drop-off'} • Task #${stop.task_id}`,
				color: stop.type === 'pickup' ? palette.tint : '#10B981',
			});
		});
		return { markerList: markers, stopLookup: lookup };
	}, [palette.tint, route?.stops]);

	const handleMarkerPress = useCallback(
		(markerId: string) => {
			const stop = stopLookup[markerId];
			if (!stop?.coordinates) return;
			openDirectionsTo(stop.coordinates.latitude, stop.coordinates.longitude, stop.label);
		},
		[stopLookup, openDirectionsTo]
	);

	useEffect(() => {
		if (!mapSupported || !mapReady || !mapRef.current || !mapCoordinates.length) {
			return;
		}

		if (mapCoordinates.length === 1) {
			const [point] = mapCoordinates;
			mapRef.current.animateToRegion(
				{
					latitude: point.latitude,
					longitude: point.longitude,
					latitudeDelta: 0.05,
					longitudeDelta: 0.05,
				},
				400
			);
			return;
		}

		mapRef.current.fitToCoordinates(mapCoordinates, {
			edgePadding: { top: 80, right: 40, bottom: 80, left: 40 },
			animated: true,
		});
	}, [mapSupported, mapReady, mapCoordinates]);

	const efficiencyScore = route?.summary?.efficiency_score ?? profile?.efficiency_score ?? 0;
	const efficiencyWidth = Math.max(0, Math.min(100, efficiencyScore));
	const totalDistance = route?.summary?.total_distance_miles ?? 0;
	const etaMinutes = route?.summary?.eta_minutes ?? 0;
	const lastUpdatedLabel = formatLastUpdatedLabel(route?.summary?.last_updated);
	const activeTasks = route?.tasks ?? [];
	const hasRoute = Boolean(route && (route.polyline.length || route.stops.length));

	const handleAccept = useCallback(
		async (taskId: number) => {
			if (!token) return;
			try {
				await acceptVolunteerTask(token, taskId);
				await fetchRoutes();
			} catch (error) {
				console.warn('Unable to accept task', error);
			}
		},
		[fetchRoutes, token]
	);


	if (loading && !hasRoute && !suggestions.length) {
		return (
			<View style={[styles.container, styles.centered]}>
				<ActivityIndicator size="large" color={palette.tint} />
				<Text style={styles.loadingText}>Calculating your route…</Text>
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView
				style={styles.scroll}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.tint} />}
				contentContainerStyle={styles.scrollContent}
			>
				<View style={styles.headerRow}>
					<View>
						<Text style={styles.title}>Today’s route</Text>
						<Text style={styles.subtitle}>
							{profile?.vehicle_type ? `${profile.vehicle_type} • ` : ''}
							{hasRoute ? `${formatMiles(totalDistance)} • ETA ${Math.max(0, Math.round(etaMinutes))} min` : 'Grab a task to get rolling'}
						</Text>
					</View>
				</View>

				{hasRoute ? (
					<View style={styles.mapCard}>
						{mapSupported ? (
							<MapboxMap
								ref={mapRef}
								style={styles.map}
								initialRegion={initialRegion}
								markers={markerList}
								polylines={mapPolylines}
								onMapReady={handleMapReady}
								onMarkerPress={handleMarkerPress}
								testID="volunteer-route-map"
							/>
						) : (
							<View style={styles.mapFallback}>
								<Text style={styles.mapFallbackText}>Add a Mapbox access token to preview the route map.</Text>
							</View>
						)}
						<View style={styles.summaryRow}>
							<SummaryMetric label="Total distance" value={formatMiles(totalDistance)} styles={styles} />
							<SummaryMetric label="Estimated time" value={`${Math.max(0, Math.round(etaMinutes))} min`} styles={styles} />
						</View>

						<View style={styles.mapMetaRow}>
							<Text style={styles.mapMetaText}>{lastUpdatedLabel}</Text>
							{profile?.preferred_radius_miles ? (
								<Text style={styles.mapMetaText}>Radius {formatMiles(profile.preferred_radius_miles)}</Text>
							) : null}
						</View>

						<View style={styles.efficiencyCard}>
							<View style={styles.efficiencyHeader}>
								<Text style={styles.efficiencyTitle}>Efficiency score</Text>
								<Text style={styles.efficiencyValue}>{efficiencyScore.toFixed(1)}</Text>
							</View>
							<View style={styles.efficiencyMeter}>
								<View style={[styles.efficiencyFill, { width: `${efficiencyWidth}%`, backgroundColor: palette.tint }]} />
							</View>
							<Text style={styles.efficiencyHint}>Score updates as you stay on time and minimize detours.</Text>
						</View>
					</View>
				) : null}

				{activeTasks.length ? (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Assigned tasks</Text>
						<View style={styles.tasksList}>
							{activeTasks.map((task) => {
								const statusStyle = statusStyles(task.status);
								const urgencyStyle = urgencyStyles(task.urgency);
								return (
									<View key={task.id} style={styles.taskCard}>
										<View style={styles.taskHeader}>
											<Text style={styles.taskTitle}>{task.title}</Text>
											{task.status ? (
												<View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}> 
													<Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{formatStatus(task.status)}</Text>
												</View>
											) : null}
										</View>
										{task.summary ? <Text style={styles.taskSummary}>{task.summary}</Text> : null}
										<View style={styles.taskMetaRow}>
											{task.distance_miles != null && Number.isFinite(task.distance_miles) ? (
												<Text style={styles.taskMeta}>{formatMiles(task.distance_miles)}</Text>
											) : null}
											{task.estimated_minutes != null && Number.isFinite(task.estimated_minutes) ? (
												<Text style={styles.taskMeta}>{Math.round(task.estimated_minutes)} min</Text>
											) : null}
											{task.load_size ? <Text style={styles.taskMeta}>{task.load_size}</Text> : null}
											{task.urgency ? (
												<View style={[styles.urgencyChip, { backgroundColor: urgencyStyle.bg }]}> 
													<Text style={[styles.urgencyChipText, { color: urgencyStyle.text }]}>{task.urgency.toUpperCase()}</Text>
												</View>
											) : null}
										</View>
										{task.pickup_address || task.dropoff_address ? (
											<Text style={styles.taskRoute}>
												{task.pickup_address || 'Pickup TBD'} → {task.dropoff_address || 'Drop-off TBD'}
											</Text>
										) : null}
										<TaskNavigationButtons task={task} onNavigate={openDirectionsTo} styles={styles} />
									</View>
								);
							})}
						</View>
					</View>
				) : null}

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>{hasRoute ? 'Stops in sequence' : 'Grab your first task'}</Text>
					{hasRoute ? (
						<View style={styles.stopsList}>
							{route?.stops.map((stop, index) => (
								<View key={stop.id} style={styles.stopRow}>
									<View style={[styles.stopBullet, { backgroundColor: stop.type === 'pickup' ? palette.tint : '#10B981' }]} />
									<View style={{ flex: 1 }}>
										<Text style={styles.stopTitle} numberOfLines={1}>
											{index + 1}. {stop.label}
										</Text>
										<Text style={styles.stopMeta}>{stop.type === 'pickup' ? 'Pickup' : 'Drop-off'} • Task #{stop.task_id}</Text>
									</View>
									<Text style={styles.stopEta}>{stop.eta_minutes != null ? `${Math.round(stop.eta_minutes)} min` : '—'}</Text>
								</View>
							))}
						</View>
					) : (
						<SuggestionsList
							styles={styles}
							suggestions={suggestions}
							onAccept={handleAccept}
							onNavigate={openDirectionsTo}
							emptyMessage="No route yet. Accept a pickup to generate a live navigation path."
						/>
					)}
				</View>

				{hasRoute && suggestions.length ? (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>More nearby pickups</Text>
						<SuggestionsList styles={styles} suggestions={suggestions} onAccept={handleAccept} onNavigate={openDirectionsTo} />
					</View>
				) : null}
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
		scroll: {
			flex: 1,
		},
		scrollContent: {
			paddingBottom: 48,
		},
		container: {
			flex: 1,
			backgroundColor: palette.background,
		},
		centered: {
			alignItems: 'center',
			justifyContent: 'center',
			gap: 12,
		},
		loadingText: {
			color: palette.icon,
			fontSize: 14,
		},
		headerRow: {
			paddingHorizontal: 24,
			paddingTop: 32,
			paddingBottom: 12,
		},
		title: {
			fontSize: 26,
			fontWeight: '700',
			letterSpacing: -0.5,
			color: palette.text,
		},
		subtitle: {
			marginTop: 4,
			fontSize: 14,
			color: palette.icon,
		},
		mapCard: {
			marginHorizontal: 24,
			borderRadius: 24,
			backgroundColor: palette.background,
			overflow: 'hidden',
			shadowColor: '#000',
			shadowOpacity: 0.08,
			shadowRadius: 16,
			shadowOffset: { width: 0, height: 8 },
			elevation: 3,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: colorWithOpacity(palette.icon, 0.12),
		},
		map: {
			height: 260,
			width: '100%',
		},
		mapFallback: {
			height: 260,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: colorWithOpacity(palette.tint, 0.08),
		},
		mapFallbackText: {
			fontSize: 13,
			fontWeight: '500',
			color: colorWithOpacity(palette.icon, 0.75),
		},
		summaryRow: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			padding: 20,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: colorWithOpacity(palette.icon, 0.12),
		},
		mapMetaRow: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			paddingHorizontal: 20,
			paddingVertical: 12,
		},
		mapMetaText: {
			fontSize: 12,
			color: colorWithOpacity(palette.icon, 0.8),
		},
		summaryValue: {
			fontSize: 20,
			fontWeight: '700',
			color: palette.text,
		},
		summaryLabel: {
			marginTop: 4,
			fontSize: 12,
			color: palette.icon,
			textTransform: 'uppercase',
			letterSpacing: 0.6,
		},
		efficiencyCard: {
			padding: 20,
			gap: 10,
		},
		efficiencyHeader: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			alignItems: 'center',
		},
		efficiencyTitle: {
			fontSize: 16,
			fontWeight: '600',
			color: palette.text,
		},
		efficiencyValue: {
			fontSize: 18,
			fontWeight: '700',
			color: palette.tint,
		},
		efficiencyMeter: {
			height: 12,
			borderRadius: 12,
			backgroundColor: colorWithOpacity(palette.tint, 0.12),
			overflow: 'hidden',
		},
		efficiencyFill: {
			height: '100%',
			borderRadius: 12,
		},
		efficiencyHint: {
			fontSize: 12,
			color: palette.icon,
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
		stopsList: {
			gap: 12,
		},
		stopRow: {
			flexDirection: 'row',
			alignItems: 'center',
			padding: 14,
			borderRadius: 16,
			backgroundColor: colorWithOpacity(palette.tint, 0.08),
			gap: 12,
		},
		stopBullet: {
			width: 14,
			height: 14,
			borderRadius: 7,
		},
		stopTitle: {
			fontSize: 15,
			fontWeight: '600',
			color: palette.text,
		},
		stopMeta: {
			marginTop: 2,
			fontSize: 12,
			color: palette.icon,
		},
		stopEta: {
			fontSize: 13,
			fontWeight: '600',
			color: palette.tint,
		},
		tasksList: {
			gap: 16,
		},
		taskCard: {
			borderRadius: 18,
			padding: 18,
			gap: 10,
			backgroundColor: colorWithOpacity(palette.tint, 0.08),
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: colorWithOpacity(palette.icon, 0.12),
		},
		taskHeader: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			alignItems: 'center',
			gap: 12,
		},
		taskTitle: {
			fontSize: 16,
			fontWeight: '700',
			color: palette.text,
			flex: 1,
		},
		statusBadge: {
			paddingHorizontal: 12,
			paddingVertical: 4,
			borderRadius: 999,
		},
		statusBadgeText: {
			fontSize: 12,
			fontWeight: '600',
			textTransform: 'capitalize',
		},
		taskSummary: {
			fontSize: 14,
			color: palette.icon,
		},
		taskMetaRow: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: 10,
			alignItems: 'center',
		},
		taskMeta: {
			fontSize: 12,
			fontWeight: '600',
			color: palette.icon,
		},
		urgencyChip: {
			paddingHorizontal: 10,
			paddingVertical: 4,
			borderRadius: 999,
		},
		urgencyChipText: {
			fontSize: 11,
			fontWeight: '700',
		},
		taskRoute: {
			fontSize: 12,
			color: palette.text,
		},
		suggestionsWrapper: {
			gap: 14,
		},
		suggestionHint: {
			fontSize: 14,
			color: palette.icon,
		},
		suggestionCard: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 16,
			padding: 16,
			borderRadius: 16,
			backgroundColor: colorWithOpacity(palette.tint, 0.08),
		},
		suggestionTitle: {
			fontSize: 16,
			fontWeight: '600',
			color: palette.text,
		},
		suggestionMeta: {
			fontSize: 12,
			color: palette.icon,
			marginTop: 4,
		},
		suggestionAddress: {
			marginTop: 4,
			fontSize: 12,
			color: palette.text,
		},
		acceptButton: {
			backgroundColor: palette.tint,
			borderRadius: 12,
			paddingHorizontal: 18,
			paddingVertical: 10,
		},
		acceptButtonText: {
			color: '#fff',
			fontWeight: '600',
			fontSize: 14,
		},
			navigateButton: {
				marginTop: 8,
				backgroundColor: 'transparent',
				paddingHorizontal: 10,
				paddingVertical: 6,
				borderRadius: 8,
			},
			navigateButtonText: {
				color: palette.tint,
				fontWeight: '700',
				fontSize: 13,
			},
		navActionsRow: {
			flexDirection: 'row',
			gap: 8,
			flexWrap: 'wrap',
			marginTop: 8,
		},
		navigatePill: {
			backgroundColor: colorWithOpacity(palette.tint, 0.16),
			paddingHorizontal: 12,
			paddingVertical: 6,
			borderRadius: 999,
		},
		navigatePillText: {
			color: palette.tint,
			fontWeight: '600',
			fontSize: 12,
			letterSpacing: 0.2,
		},
	});

type VolunteerStyles = ReturnType<typeof createStyles>;

function SummaryMetric({ label, value, styles }: { label: string; value: string; styles: VolunteerStyles }) {
	return (
		<View>
			<Text style={styles.summaryValue}>{value}</Text>
			<Text style={styles.summaryLabel}>{label}</Text>
		</View>
	);
}

function TaskNavigationButtons({
	task,
	onNavigate,
	styles,
}: {
	task: VolunteerTask;
	onNavigate: (lat?: number | null, lng?: number | null, label?: string) => void;
	styles: VolunteerStyles;
}) {
	const hasPickup = task.pickup_latitude != null && task.pickup_longitude != null;
	const hasDropoff = task.dropoff_latitude != null && task.dropoff_longitude != null;
	if (!hasPickup && !hasDropoff) return null;

	const pickupLabel = task.pickup_address || `${task.title} pickup`;
	const dropoffLabel = task.dropoff_address || `${task.title} drop-off`;

	return (
		<View style={styles.navActionsRow}>
			{hasPickup ? (
				<TouchableOpacity
					style={styles.navigatePill}
					onPress={() => onNavigate(task.pickup_latitude, task.pickup_longitude, pickupLabel)}
					accessibilityRole="button"
				>
					<Text style={styles.navigatePillText}>Pickup directions</Text>
				</TouchableOpacity>
			) : null}
			{hasDropoff ? (
				<TouchableOpacity
					style={styles.navigatePill}
					onPress={() => onNavigate(task.dropoff_latitude, task.dropoff_longitude, dropoffLabel)}
					accessibilityRole="button"
				>
					<Text style={styles.navigatePillText}>Drop-off directions</Text>
				</TouchableOpacity>
			) : null}
		</View>
	);
}

function SuggestionsList({
	suggestions,
	onAccept,
	onNavigate,
	styles,
	emptyMessage,
}: {
	suggestions: VolunteerTask[];
	onAccept: (taskId: number) => void;
	onNavigate: (lat?: number | null, lng?: number | null, label?: string) => void;
	styles: VolunteerStyles;
	emptyMessage?: string;
}) {
	if (!suggestions.length) {
		return emptyMessage ? <Text style={styles.suggestionHint}>{emptyMessage}</Text> : null;
	}
	return (
		<View style={styles.suggestionsWrapper}>
			{emptyMessage ? <Text style={styles.suggestionHint}>{emptyMessage}</Text> : null}
			{suggestions.map((task) => (
				<View key={task.id} style={styles.suggestionCard}>
					<View style={{ flex: 1 }}>
						<Text style={styles.suggestionTitle}>{task.title}</Text>
						<Text style={styles.suggestionMeta}>
							{task.distance_miles != null && Number.isFinite(task.distance_miles) ? `${formatMiles(task.distance_miles)} • ` : ''}
							{task.urgency ? `${task.urgency.toUpperCase()} • ` : ''}
							{task.load_size || 'Flexible load'}
						</Text>
						<Text style={styles.suggestionAddress}>
							{task.pickup_address || 'Pickup TBD'} → {task.dropoff_address || 'Drop-off TBD'}
						</Text>
						<TaskNavigationButtons task={task} onNavigate={onNavigate} styles={styles} />
					</View>
					<TouchableOpacity style={styles.acceptButton} onPress={() => onAccept(task.id)}>
						<Text style={styles.acceptButtonText}>Accept</Text>
					</TouchableOpacity>
				</View>
			))}
		</View>
	);
}

function colorWithOpacity(hex: string, opacity: number) {
	const normalizedOpacity = Math.min(Math.max(opacity, 0), 1);
	const alpha = Math.round(normalizedOpacity * 255)
		.toString(16)
		.padStart(2, '0');
	return `${hex}${alpha}`;
}

function statusStyles(rawStatus?: string) {
	const normalized = rawStatus?.toLowerCase() ?? '';
	const map: Record<string, { bg: string; text: string }> = {
		assigned: { bg: '#DBEAFE', text: '#1D4ED8' },
		en_route: { bg: '#E0E7FF', text: '#4338CA' },
		'en route': { bg: '#E0E7FF', text: '#4338CA' },
		picked_up: { bg: '#FEF3C7', text: '#B45309' },
		delivering: { bg: '#DCFCE7', text: '#047857' },
		completed: { bg: '#D1FAE5', text: '#047857' },
		cancelled: { bg: '#FEE2E2', text: '#DC2626' },
	};
	return map[normalized] || { bg: '#E2E8F0', text: '#475569' };
}

function urgencyStyles(rawUrgency?: string) {
	const normalized = rawUrgency?.toLowerCase() ?? '';
	const map: Record<string, { bg: string; text: string }> = {
		critical: { bg: '#FEE2E2', text: '#DC2626' },
		high: { bg: '#FEF3C7', text: '#B45309' },
		medium: { bg: '#E0E7FF', text: '#4338CA' },
		low: { bg: '#DCFCE7', text: '#047857' },
	};
	return map[normalized] || { bg: '#E2E8F0', text: '#475569' };
}

function formatStatus(status?: string) {
	if (!status) return '';
	return status.replace(/_/g, ' ');
}

function formatMiles(distance: number | null | undefined): string {
	if (distance == null || !Number.isFinite(distance)) return '0 mi';
	const rounded = distance >= 10 ? Math.round(distance) : Math.round(distance * 10) / 10;
	return `${rounded} mi`;
}

// cleaned up trailing stray import


