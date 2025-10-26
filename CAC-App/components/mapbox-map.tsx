import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleProp, Text, View, ViewStyle } from 'react-native';
import Constants from 'expo-constants';

import type { WebViewMessageEvent } from 'react-native-webview';

type WebViewType = typeof import('react-native-webview').WebView;

const isWeb = Platform.OS === 'web';
let NativeWebView: WebViewType | null = null;
if (!isWeb) {
  NativeWebView = require('react-native-webview').WebView;
}

type LatLng = {
  latitude: number;
  longitude: number;
};

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type EdgePadding = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type MapboxMarker = {
  id: string;
  coordinate: LatLng;
  title?: string;
  subtitle?: string;
  color?: string;
  selected?: boolean;
};

export type MapboxPolyline = {
  id: string;
  coordinates: LatLng[];
  color?: string;
  width?: number;
};

export type MapboxRegion = Region;

export type MapboxMapHandle = {
  fitToCoordinates: (coordinates: LatLng[], options?: { edgePadding?: EdgePadding; animated?: boolean; duration?: number }) => void;
  animateToRegion: (region: Region, durationMs?: number) => void;
};

type MapboxMapProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  markers?: MapboxMarker[];
  polylines?: MapboxPolyline[];
  onMapReady?: () => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: (coordinate: LatLng) => void;
  accessToken?: string;
  mapStyleURL?: string;
  testID?: string;
};

type MapPayload = {
  markers: MapboxMarker[];
  polylines: MapboxPolyline[];
};

type CommandMessage =
  | { type: 'apply'; payload: MapPayload }
  | { type: 'command'; command: 'fitToCoordinates'; coordinates: LatLng[]; padding?: EdgePadding | number; duration?: number }
  | { type: 'command'; command: 'animateToRegion'; region: Region; duration?: number };

type BridgeMessage =
  | { type: 'ready' }
  | { type: 'marker-press'; id: string }
  | { type: 'map-press'; coordinate: LatLng };

const DEFAULT_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

const DEFAULT_STYLE_URL = 'mapbox://styles/mapbox/streets-v12';

function regionToCamera(region?: Region) {
  const base = region ?? DEFAULT_REGION;
  const delta = Math.max(base.latitudeDelta, base.longitudeDelta, 0.0005);
  const zoom = Math.max(Math.min(Math.log2(360 / delta), 20), 2);
  return {
    center: [base.longitude, base.latitude] as [number, number],
    zoom,
  };
}

function toMessage(payload: CommandMessage): string {
  return JSON.stringify(payload).replace(/<\/script>/gi, '<\\/script>');
}

function normalizePadding(padding?: EdgePadding | number) {
  if (padding == null) {
    return 48;
  }
  if (typeof padding === 'number') {
    return padding;
  }
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding;
  return { top, right, bottom, left };
}

function resolveToken(explicit?: string) {
  if (explicit) {
    return explicit;
  }
  const env = (globalThis as Record<string, any>).process?.env ?? {};
  const envToken = env.EXPO_PUBLIC_MAPBOX_TOKEN ?? env.MAPBOX_ACCESS_TOKEN;
  if (envToken) {
    return envToken;
  }
  const extra = (Constants?.expoConfig?.extra ?? {}) as Record<string, any>;
  if (typeof extra.mapboxAccessToken === 'string' && extra.mapboxAccessToken.length > 0) {
    return extra.mapboxAccessToken;
  }
  const manifestExtra = (Constants as Record<string, any>)?.manifest?.extra ?? {};
  if (typeof manifestExtra.mapboxAccessToken === 'string' && manifestExtra.mapboxAccessToken.length > 0) {
    return manifestExtra.mapboxAccessToken;
  }
  return undefined;
}

const FallbackView = ({ style, reason }: { style?: StyleProp<ViewStyle>; reason: 'no-token' | 'unsupported' }) => (
  <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: '#e2e8f0' }, style]}>
    <Text style={{ color: '#475569', fontSize: 13, textAlign: 'center', paddingHorizontal: 16 }}>
      {reason === 'no-token'
        ? 'Mapbox access token missing. Set EXPO_PUBLIC_MAPBOX_TOKEN to enable the map.'
        : 'Map preview unavailable on this platform.'}
    </Text>
  </View>
);

const MapboxNative = forwardRef<MapboxMapHandle, MapboxMapProps>((props, ref) => {
  if (isWeb || !NativeWebView) {
    return <FallbackView style={props.style} reason={isWeb ? 'unsupported' : 'no-token'} />;
  }

  const {
    style,
    initialRegion,
    markers = [],
    polylines = [],
    onMapReady,
    onMarkerPress,
    onMapPress,
    accessToken,
    mapStyleURL,
    testID,
  } = props;

  const token = resolveToken(accessToken);
  if (!token) {
    return <FallbackView style={style} reason="no-token" />;
  }

  const camera = useMemo(() => regionToCamera(initialRegion), [initialRegion]);
  const html = useMemo(
    () => buildHtml({ token, camera, styleURL: mapStyleURL ?? DEFAULT_STYLE_URL }),
    [token, camera, mapStyleURL],
  );

  const webViewRef = useRef<import('react-native-webview').WebView>(null);
  const readyRef = useRef(false);
  const pending = useRef<string[]>([]);
  const latestPayload = useRef<MapPayload>({ markers: [], polylines: [] });

  const payload = useMemo<MapPayload>(() => ({ markers, polylines }), [markers, polylines]);

  const flush = useCallback(() => {
    if (!readyRef.current || !webViewRef.current) return;
    while (pending.current.length) {
      const next = pending.current.shift();
      if (next) {
        webViewRef.current.postMessage(next);
      }
    }
  }, []);

  const enqueue = useCallback(
    (message: CommandMessage) => {
      const serialized = toMessage(message);
      if (readyRef.current && webViewRef.current) {
        webViewRef.current.postMessage(serialized);
        return;
      }
      pending.current.push(serialized);
    },
    [],
  );

  useEffect(() => {
    latestPayload.current = payload;
    enqueue({ type: 'apply', payload });
  }, [enqueue, payload]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as BridgeMessage;
        if (data.type === 'ready') {
          if (!readyRef.current) {
            readyRef.current = true;
            flush();
            if (latestPayload.current) {
              enqueue({ type: 'apply', payload: latestPayload.current });
              flush();
            }
            onMapReady?.();
          }
          return;
        }
        if (data.type === 'marker-press') {
          onMarkerPress?.(data.id);
          return;
        }
        if (data.type === 'map-press') {
          onMapPress?.(data.coordinate);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Mapbox WebView message error', error);
        }
      }
    },
    [enqueue, flush, onMapPress, onMapReady, onMarkerPress],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitToCoordinates(coordinates, options) {
        if (!coordinates?.length) return;
        enqueue({
          type: 'command',
          command: 'fitToCoordinates',
          coordinates,
          padding: normalizePadding(options?.edgePadding),
          duration: options?.animated === false ? 0 : options?.duration,
        });
        flush();
      },
      animateToRegion(region, durationMs = 500) {
        enqueue({
          type: 'command',
          command: 'animateToRegion',
          region,
          duration: durationMs,
        });
        flush();
      },
    }),
    [enqueue, flush],
  );

  return (
    <NativeWebView
      ref={webViewRef}
      originWhitelist={["*"]}
      source={{ html }}
      style={style as any}
      onMessage={handleMessage}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      androidHardwareAccelerationDisabled={false}
      automaticallyAdjustContentInsets={false}
      scrollEnabled={false}
      testID={testID}
    />
  );
});
MapboxNative.displayName = 'MapboxNativeMap';

const MapboxWeb = forwardRef<MapboxMapHandle, MapboxMapProps>((props, ref) => {
  const {
    style,
    initialRegion,
    markers = [],
    polylines = [],
    onMapReady,
    onMarkerPress,
    onMapPress,
    accessToken,
    mapStyleURL,
    testID,
  } = props;

  const token = resolveToken(accessToken);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('mapbox-gl').Map | null>(null);
  const mapboxModuleRef = useRef<typeof import('mapbox-gl') | null>(null);
  const markersRef = useRef<Map<string, import('mapbox-gl').Marker>>(new Map());
  const polylineIdsRef = useRef<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;

    const load = async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      mapboxModuleRef.current = mapboxgl;
      if (!document.querySelector('link[data-mapbox-gl-css="true"]')) {
        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', 'https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css');
        link.setAttribute('data-mapbox-gl-css', 'true');
        document.head.appendChild(link);
      }
      mapboxgl.accessToken = token;
      const camera = regionToCamera(initialRegion);
      const map = new mapboxgl.Map({
        container: containerRef.current as HTMLDivElement,
        style: mapStyleURL ?? DEFAULT_STYLE_URL,
        center: camera.center,
        zoom: camera.zoom,
        attributionControl: false,
      });
      mapRef.current = map;

      map.on('load', () => {
        if (cancelled) return;
        setReady(true);
        onMapReady?.();
      });

      map.on('click', (event) => {
        onMapPress?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
      });
    };

    load();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      polylineIdsRef.current.forEach((id) => {
        if (!mapRef.current) return;
        if (mapRef.current.getLayer(id)) {
          mapRef.current.removeLayer(id);
        }
        if (mapRef.current.getSource(id)) {
          mapRef.current.removeSource(id);
        }
      });
      polylineIdsRef.current.clear();
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [initialRegion, mapStyleURL, onMapPress, onMapReady, token]);

  useEffect(() => {
    if (!ready || !mapRef.current || !mapboxModuleRef.current) {
      return;
    }
    const map = mapRef.current;
    const mapboxgl = mapboxModuleRef.current;

    const markerIds = new Set<string>();
    markers.forEach((marker) => {
      markerIds.add(marker.id);
      const lngLat: [number, number] = [marker.coordinate.longitude, marker.coordinate.latitude];
      const existing = markersRef.current.get(marker.id);
      if (existing) {
        existing.setLngLat(lngLat);
        const element = existing.getElement();
        element.style.backgroundColor = marker.color ?? '#6366F1';
        element.style.transform = marker.selected ? 'translateY(-6px) scale(1.08)' : 'translateY(-6px)';
        return;
      }
      const element = document.createElement('div');
      element.style.width = '28px';
      element.style.height = '28px';
      element.style.borderRadius = '14px';
      element.style.border = '2px solid rgba(255,255,255,0.9)';
      element.style.boxShadow = '0 6px 12px rgba(15,23,42,0.35)';
      element.style.backgroundColor = marker.color ?? '#6366F1';
      element.style.transform = marker.selected ? 'translateY(-6px) scale(1.08)' : 'translateY(-6px)';
      element.style.transition = 'transform 0.18s ease';
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onMarkerPress?.(marker.id);
      });
      const instance = new mapboxgl.Marker({ element, anchor: 'bottom' }).setLngLat(lngLat).addTo(map);
      markersRef.current.set(marker.id, instance);
    });

    markersRef.current.forEach((value, key) => {
      if (!markerIds.has(key)) {
        value.remove();
        markersRef.current.delete(key);
      }
    });

    const nextPolylineIds = new Set<string>();
    polylines.forEach((polyline) => {
      if (!polyline.coordinates.length) {
        return;
      }
      const sourceId = `polyline-${polyline.id}`;
      const data = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: polyline.coordinates.map((coord) => [coord.longitude, coord.latitude]),
        },
      } as const;
      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as any).setData(data);
        map.setPaintProperty(sourceId, 'line-color', polyline.color ?? '#6366F1');
        map.setPaintProperty(sourceId, 'line-width', Math.max(polyline.width ?? 4, 1));
      } else {
        map.addSource(sourceId, { type: 'geojson', data });
        map.addLayer({
          id: sourceId,
          type: 'line',
          source: sourceId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': polyline.color ?? '#6366F1',
            'line-width': Math.max(polyline.width ?? 4, 1),
            'line-opacity': 0.85,
          },
        });
      }
      nextPolylineIds.add(sourceId);
    });

    polylineIdsRef.current.forEach((id) => {
      if (!nextPolylineIds.has(id)) {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
        if (map.getSource(id)) {
          map.removeSource(id);
        }
        polylineIdsRef.current.delete(id);
      }
    });
    nextPolylineIds.forEach((id) => polylineIdsRef.current.add(id));
  }, [markers, onMarkerPress, polylines, ready]);

  useImperativeHandle(
    ref,
    () => ({
      fitToCoordinates(coordinates, options) {
        if (!coordinates?.length || !mapRef.current || !mapboxModuleRef.current) return;
        const map = mapRef.current;
        const mapboxgl = mapboxModuleRef.current;
        let bounds: import('mapbox-gl').LngLatBounds | null = null;
        coordinates.forEach((coord) => {
          const lngLat: [number, number] = [coord.longitude, coord.latitude];
          if (!bounds) {
            bounds = new mapboxgl.LngLatBounds(lngLat, lngLat);
          } else {
            bounds.extend(lngLat);
          }
        });
        if (!bounds) return;
        const padding = normalizePadding(options?.edgePadding);
        const duration = options?.animated === false ? 0 : options?.duration ?? 600;
        map.fitBounds(bounds, { padding, duration });
      },
      animateToRegion(region, durationMs = 500) {
        if (!mapRef.current) return;
        const camera = regionToCamera(region);
        mapRef.current.easeTo({ center: camera.center, zoom: camera.zoom, duration: durationMs });
      },
    }),
    [],
  );

  if (!token) {
    return <FallbackView style={style} reason="no-token" />;
  }

  return (
    <View style={style} testID={testID}>
      <div
        ref={containerRef as any}
        style={{ width: '100%', height: '100%', position: 'relative', borderRadius: 'inherit', overflow: 'hidden' }}
      />
    </View>
  );
});
MapboxWeb.displayName = 'MapboxWebMap';

export const MapboxMap = forwardRef<MapboxMapHandle, MapboxMapProps>((props, ref) => {
  if (isWeb) {
    return <MapboxWeb ref={ref} {...props} />;
  }
  return <MapboxNative ref={ref} {...props} />;
});
MapboxMap.displayName = 'MapboxMap';

export function isMapboxAvailable(accessToken?: string) {
  return Boolean(resolveToken(accessToken));
}

function buildHtml({ token, camera, styleURL }: { token: string; camera: { center: [number, number]; zoom: number }; styleURL: string }) {
  const payload = { token, camera, styleURL };

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; background: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  #map { position: absolute; top: 0; bottom: 0; width: 100%; height: 100%; }
  .mapboxgl-ctrl { display: none; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<script>
(function() {
  const config = ${JSON.stringify(payload)};
  mapboxgl.accessToken = config.token;
  const map = new mapboxgl.Map({
    container: 'map',
    style: config.styleURL,
    center: config.camera.center,
    zoom: config.camera.zoom,
    attributionControl: false
  });
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  const state = {
    markers: new Map(),
    polylines: new Set(),
  };

  function send(message) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  }

  function regionToZoom(region) {
    if (!region) return config.camera.zoom;
    const delta = Math.max(region.latitudeDelta || 0.0005, region.longitudeDelta || 0.0005, 0.0005);
    const zoom = Math.max(Math.min(Math.log2(360 / delta), 20), 2);
    return zoom;
  }

  function normalizePadding(padding) {
    if (padding == null) return 48;
    if (typeof padding === 'number') return padding;
    const top = padding.top || 0;
    const right = padding.right || 0;
    const bottom = padding.bottom || 0;
    const left = padding.left || 0;
    return { top, right, bottom, left };
  }

  function applyMarkers(markers) {
    const active = new Set();
    markers.forEach(function(marker) {
      if (!marker || !marker.id) return;
      active.add(marker.id);
      var lngLat = [marker.coordinate.longitude, marker.coordinate.latitude];
      var instance = state.markers.get(marker.id);
      if (!instance) {
        var element = document.createElement('div');
        element.style.width = '28px';
        element.style.height = '28px';
        element.style.borderRadius = '14px';
        element.style.border = '2px solid rgba(255,255,255,0.9)';
        element.style.boxShadow = '0 6px 12px rgba(15,23,42,0.35)';
        element.style.backgroundColor = marker.color || '#6366F1';
        element.style.transform = marker.selected ? 'translateY(-6px) scale(1.08)' : 'translateY(-6px)';
        element.style.transition = 'transform 0.18s ease';
        element.addEventListener('click', function(event) {
          event.stopPropagation();
          send({ type: 'marker-press', id: marker.id });
        });
        instance = new mapboxgl.Marker({ element: element, anchor: 'bottom' }).setLngLat(lngLat).addTo(map);
        state.markers.set(marker.id, instance);
      } else {
        instance.setLngLat(lngLat);
        var element = instance.getElement();
        element.style.backgroundColor = marker.color || '#6366F1';
        element.style.transform = marker.selected ? 'translateY(-6px) scale(1.08)' : 'translateY(-6px)';
      }
    });
    Array.from(state.markers.keys()).forEach(function(id) {
      if (!active.has(id)) {
        var marker = state.markers.get(id);
        marker && marker.remove();
        state.markers.delete(id);
      }
    });
  }

  function applyPolylines(polylines) {
    const active = new Set();
    polylines.forEach(function(polyline) {
      if (!polyline || !polyline.id || !Array.isArray(polyline.coordinates) || !polyline.coordinates.length) return;
      const sourceId = 'polyline-' + polyline.id;
      const data = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: polyline.coordinates.map(function(coord) { return [coord.longitude, coord.latitude]; })
        }
      };
      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(data);
        map.setPaintProperty(sourceId, 'line-color', polyline.color || '#6366F1');
        map.setPaintProperty(sourceId, 'line-width', Math.max(polyline.width || 4, 1));
      } else {
        map.addSource(sourceId, { type: 'geojson', data: data });
        map.addLayer({
          id: sourceId,
          type: 'line',
          source: sourceId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': polyline.color || '#6366F1',
            'line-width': Math.max(polyline.width || 4, 1),
            'line-opacity': 0.85
          }
        });
      }
      active.add(sourceId);
    });
    Array.from(state.polylines).forEach(function(id) {
      if (!active.has(id)) {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
        state.polylines.delete(id);
      }
    });
    active.forEach(function(id) { state.polylines.add(id); });
  }

  function applyPayload(payload) {
    if (!payload) return;
    applyMarkers(payload.markers || []);
    applyPolylines(payload.polylines || []);
  }

  function handleMessage(event) {
    try {
      var raw = event && event.data != null ? event.data : event;
      if (typeof raw !== 'string') return;
      var message = JSON.parse(raw);
      if (message.type === 'apply') {
        applyPayload(message.payload);
      }
      if (message.type === 'command') {
        if (message.command === 'fitToCoordinates' && Array.isArray(message.coordinates) && message.coordinates.length) {
          var bounds = null;
          message.coordinates.forEach(function(coord) {
            if (!coord) return;
            var lngLat = [coord.longitude, coord.latitude];
            if (!bounds) {
              bounds = new mapboxgl.LngLatBounds(lngLat, lngLat);
            } else {
              bounds.extend(lngLat);
            }
          });
          if (bounds) {
            map.fitBounds(bounds, {
              padding: normalizePadding(message.padding),
              duration: typeof message.duration === 'number' ? message.duration : 600,
            });
          }
        }
        if (message.command === 'animateToRegion' && message.region) {
          map.easeTo({
            center: [message.region.longitude, message.region.latitude],
            zoom: regionToZoom(message.region),
            duration: typeof message.duration === 'number' ? message.duration : 500,
          });
        }
      }
    } catch (error) {
      console.warn('Map message parse error', error);
    }
  }

  map.on('click', function(event) {
    send({ type: 'map-press', coordinate: { latitude: event.lngLat.lat, longitude: event.lngLat.lng } });
  });

  map.on('load', function() {
    send({ type: 'ready' });
  });

  document.addEventListener('message', handleMessage);
  window.addEventListener('message', handleMessage);
})();
</script>
</body>
</html>`;
}
