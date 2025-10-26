import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

type MapViewComponent = typeof import('react-native-maps').default;
type MapMarkerComponent = typeof import('react-native-maps').Marker;
type MapPolylineComponent = typeof import('react-native-maps').Polyline;

type MapComponents = {
  MapView?: MapViewComponent;
  Marker?: MapMarkerComponent;
  Polyline?: MapPolylineComponent;
};

let cachedComponents: MapComponents | null = null;
let warnedUnavailable = false;

function hasNativeMapsSupport(): boolean {
  if (Platform.OS === 'web') {
    return false;
  }

  const appOwnership = Constants?.appOwnership;
  if (appOwnership === 'expo') {
    return false;
  }

  const nativeModules = NativeModules as Record<string, unknown>;
  const hasNativeModule = Boolean(
    nativeModules?.RNMapsAirModule || nativeModules?.AirMapsModule || nativeModules?.AIRMapManager,
  );
  return hasNativeModule;
}

export function resolveMapComponents(): MapComponents {
  if (cachedComponents) {
    return cachedComponents;
  }

  if (!hasNativeMapsSupport()) {
    cachedComponents = {};
    if (__DEV__ && !warnedUnavailable) {
      console.warn('react-native-maps native module is unavailable; map visualisations will be hidden.');
      warnedUnavailable = true;
    }
    return cachedComponents;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const maps = require('react-native-maps');
    cachedComponents = {
      MapView: maps?.default ?? maps?.MapView,
      Marker: maps?.Marker,
      Polyline: maps?.Polyline,
    };
  } catch (error) {
    cachedComponents = {};
    if (__DEV__ && !warnedUnavailable) {
      console.warn(
        'react-native-maps failed to load; map visualisations will be hidden.',
        error instanceof Error ? error.message : error,
      );
      warnedUnavailable = true;
    }
  }

  return cachedComponents;
}

export function isMapAvailable(): boolean {
  const components = resolveMapComponents();
  return Boolean(components.MapView && components.Marker);
}
