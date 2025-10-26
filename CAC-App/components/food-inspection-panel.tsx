import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { deleteFoodInspection, getFoodInspections, uploadFoodInspection } from '@/app/api';
import { Colors } from '@/constants/theme';

const FALLBACK_SECONDARY = '#64748B';

export type InspectionPalette = (typeof Colors)['light'] & { secondaryText?: string };

export type FoodInspectionRecord = {
  id: number;
  status: string;
  image?: string | null;
  image_url?: string | null;
  analysis?: Record<string, any> | null;
  error_message?: string | null;
  created_at: string;
};

type PickerAsset = {
  uri: string;
  fileName?: string | null;
  name?: string | null;
  mimeType?: string | null;
};

type FoodInspectionPanelProps = {
  token: string | null;
  palette: InspectionPalette;
  mode: 'donor' | 'charity';
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  onUseAnalysis?: (analysis: Record<string, any>, inspection: FoodInspectionRecord) => void;
};

export function FoodInspectionPanel({ token, palette, mode, accentColor, style, onUseAnalysis }: FoodInspectionPanelProps) {
  const [inspections, setInspections] = useState<FoodInspectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = accentColor ?? palette.tint;
  const secondary = palette.secondaryText ?? FALLBACK_SECONDARY;

  const copy = useMemo(() => {
    if (mode === 'donor') {
      return {
        title: 'AI freshness scan',
        subtitle: 'Upload a kitchen photo to verify quality before you publish donations.',
        actionLabel: 'Scan photo',
        emptyTitle: 'No scans yet',
        emptySubtitle: 'Share a quick snapshot to generate freshness, expiry, and confidence scores.',
      };
    }
    return {
      title: 'Check food quality',
      subtitle: 'Snap the items you receive to confirm freshness and estimated expiry instantly.',
      actionLabel: 'Analyze photo',
      emptyTitle: 'Start a quality check',
      emptySubtitle: 'Upload an image of your groceries to get a freshness confidence report.',
    };
  }, [mode]);

  const fetchInspections = useCallback(async () => {
    if (!token) {
      setInspections([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getFoodInspections(token);
      if (Array.isArray(res)) {
        setInspections(res);
      } else {
        setInspections([]);
      }
      setError(null);
    } catch (err: any) {
      console.warn('Failed to load food inspections', err);
      const message = err?.body?.error || err?.body?.detail || err?.message || 'Unable to load scans right now.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInspections();
  }, [fetchInspections]);

  const processAsset = useCallback(
    async (asset: PickerAsset | null | undefined) => {
      if (!token || uploading || !asset?.uri) {
        return;
      }

      setUploading(true);
      try {
        const created = await uploadFoodInspection(token, asset as any);
        if (created) {
          setInspections((current) => [created, ...current.filter((item) => item.id !== created.id)]);
          setError(null);
        }
        await fetchInspections();
      } catch (err: any) {
        console.warn('Food inspection upload failed', err);
        const message =
          err?.body?.details || err?.body?.error || err?.message || 'Image analysis failed. Please try again.';
        setError(message);
        Alert.alert('Scan failed', message);
      } finally {
        setUploading(false);
      }
    },
    [fetchInspections, token, uploading],
  );

  const pickFromLibrary = useCallback(async () => {
    if (!token || uploading) return;
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
        await processAsset(result.assets[0]);
      }
    } catch (err: any) {
      console.warn('Opening media library failed', err);
      const message = err?.message || 'Could not open the photo library.';
      setError(message);
      Alert.alert('Photo library unavailable', message);
    }
  }, [processAsset, token, uploading]);

  const captureWithCamera = useCallback(async () => {
    if (!token || uploading) return;
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
        await processAsset(result.assets[0]);
      }
    } catch (err: any) {
      console.warn('Camera capture failed', err);
      const message = err?.message || 'Could not access the camera.';
      setError(message);
      Alert.alert('Camera unavailable', message);
    }
  }, [processAsset, token, uploading]);

  const handleAnalyze = useCallback(() => {
    if (!token || uploading) return;

    const buttons = [
      { text: 'Cancel', style: 'cancel' as const },
      { text: 'Take Photo', onPress: () => captureWithCamera() },
      { text: 'Photo Library', onPress: () => pickFromLibrary() },
    ];

    const orderedButtons = Platform.OS === 'android' ? [buttons[0], buttons[2], buttons[1]] : buttons;

    Alert.alert('Scan food item', 'Take a new photo or choose one from your library.', orderedButtons);
  }, [captureWithCamera, pickFromLibrary, token, uploading]);

  const recentInspections = useMemo(() => inspections.slice(0, 3), [inspections]);

  const handleDelete = useCallback(
    (inspectionId: number) => {
      if (!token) return;

      Alert.alert(
        'Delete scan?',
        'This will remove the AI analysis result for this photo.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              (async () => {
                try {
                  await deleteFoodInspection(token, inspectionId);
                  setInspections((current) => current.filter((item) => item.id !== inspectionId));
                } catch (err: any) {
                  console.warn('Failed to delete inspection', err);
                  const message = err?.body?.detail || err?.message || 'Unable to delete scan right now.';
                  Alert.alert('Delete failed', message);
                }
              })();
            },
          },
        ],
        { cancelable: true },
      );
    },
    [token],
  );

  return (
    <View style={[panelStyles.base, style]}> 
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.title, { color: palette.text }]}>{copy.title}</Text>
          <Text style={[styles.subtitle, { color: secondary }]}>{copy.subtitle}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.actionButton, { backgroundColor: accent, opacity: !token ? 0.5 : 1 }]}
          onPress={handleAnalyze}
          disabled={!token || uploading}
          activeOpacity={0.85}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <View style={styles.actionContent}>
              <Ionicons name="scan" size={16} color="#FFFFFF" />
              <Text style={styles.actionText}>{copy.actionLabel}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: withAlpha(palette.danger, 0.12) }]}>
          <Ionicons name="warning" size={16} color={palette.danger} />
          <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
        </View>
      ) : null}

      {loading && !recentInspections.length ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator size="small" color={accent} />
          <Text style={[styles.loaderText, { color: secondary }]}>Loading recent scans…</Text>
        </View>
      ) : null}

      {!loading && !recentInspections.length ? (
        <View style={[styles.emptyState, { backgroundColor: withAlpha(accent, 0.08), borderColor: withAlpha(accent, 0.18) }]}>
          <Ionicons name="sparkles-outline" size={24} color={accent} />
          <Text style={[styles.emptyTitle, { color: palette.text }]}>{copy.emptyTitle}</Text>
          <Text style={[styles.emptySubtitle, { color: secondary }]}>{copy.emptySubtitle}</Text>
        </View>
      ) : null}

      {recentInspections.map((inspection) => (
        <InspectionResultCard
          key={inspection.id}
          inspection={inspection}
          palette={palette}
          accent={accent}
          allowUse={mode === 'donor' && typeof onUseAnalysis === 'function'}
          onUse={() => onUseAnalysis?.(inspection.analysis ?? {}, inspection)}
          onDelete={() => handleDelete(inspection.id)}
        />
      ))}
    </View>
  );
}

type InspectionResultCardProps = {
  inspection: FoodInspectionRecord;
  palette: InspectionPalette;
  accent: string;
  allowUse?: boolean;
  onUse?: () => void;
  onDelete?: () => void;
};

function InspectionResultCard({ inspection, palette, accent, allowUse, onUse, onDelete }: InspectionResultCardProps) {
  const analysis = inspection.analysis ?? {};
  const foodItem = safeLabel(analysis?.food_item?.value) || 'Awaiting classification';
  const foodType = safeLabel(analysis?.food_type?.value) || 'Unclassified';
  const foodConfidence = formatPercent(analysis?.food_item?.confidence);
  const freshnessScore = formatFreshness(analysis?.freshness_rating?.value);
  const freshnessConfidence = formatPercent(analysis?.freshness_rating?.confidence);
  const expiryValue = analysis?.expiry_date?.value || 'Estimate pending';
  const expiryConfidence = formatPercent(analysis?.expiry_date?.confidence);
  const previewUri = inspection.image_url || undefined;
  const scannedAt = formatTimestamp(inspection.created_at);

  const statusConfig: Record<string, { label: string; color: string; background: string }> = {
    pending: {
      label: 'Analyzing',
      color: palette.warning,
      background: withAlpha(palette.warning, 0.18),
    },
    succeeded: {
      label: 'Complete',
      color: palette.success,
      background: withAlpha(palette.success, 0.18),
    },
    failed: {
      label: 'Failed',
      color: palette.danger,
      background: withAlpha(palette.danger, 0.18),
    },
  };

  const status = statusConfig[inspection.status] ?? statusConfig.pending;

  return (
    <View style={[styles.resultCard, { borderColor: withAlpha(accent, 0.14) }]}> 
      <View style={styles.resultHeader}>
        <Text style={[styles.resultTitle, { color: palette.text }]}>{foodItem}</Text>
        <View style={[styles.statusPill, { backgroundColor: status.background }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
      <View style={styles.rowActions}>
        <Text style={[styles.resultSubtitle, { color: palette.secondaryText ?? FALLBACK_SECONDARY }]}>Category • {foodType} • Confidence {foodConfidence}</Text>
        <View style={styles.iconRow}>
          {allowUse && inspection.status === 'succeeded' && onUse ? (
            <TouchableOpacity onPress={onUse} style={styles.iconButton} accessibilityRole="button">
              <Ionicons name="sparkles-outline" size={16} color={accent} />
            </TouchableOpacity>
          ) : null}
          {onDelete ? (
            <TouchableOpacity onPress={onDelete} style={styles.iconButton} accessibilityRole="button">
              <Ionicons name="trash" size={16} color={palette.danger} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <View style={styles.resultBody}>
        <View style={[styles.previewFrame, { backgroundColor: withAlpha(accent, 0.08) }]}> 
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <Ionicons name="image" size={28} color={accent} />
          )}
        </View>
        <View style={styles.resultMeta}>
          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: withAlpha(accent, 0.12) }]}> 
              <Ionicons name="leaf" size={14} color={accent} />
              <Text style={[styles.chipText, { color: accent }]}>Freshness {freshnessScore}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: withAlpha(accent, 0.12) }]}> 
              <Ionicons name="speedometer" size={14} color={accent} />
              <Text style={[styles.chipText, { color: accent }]}>Confidence {freshnessConfidence}</Text>
            </View>
          </View>
          <Text style={[styles.metaLine, { color: palette.text }]}>Expiry • {expiryValue}</Text>
          <Text style={[styles.metaSubline, { color: palette.secondaryText ?? FALLBACK_SECONDARY }]}>Expiry confidence {expiryConfidence}</Text>
          <Text style={[styles.timestamp, { color: palette.secondaryText ?? FALLBACK_SECONDARY }]}>{scannedAt}</Text>
          {inspection.status === 'failed' && inspection.error_message ? (
            <Text style={[styles.errorText, { color: palette.danger }]}>{inspection.error_message}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const panelStyles = StyleSheet.create({
  base: {
    borderRadius: 20,
    padding: 18,
    gap: 16,
  },
});

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loaderText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyState: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  resultCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  resultSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  resultBody: {
    flexDirection: 'row',
    gap: 14,
  },
  previewFrame: {
    width: 88,
    height: 88,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  resultMeta: {
    flex: 1,
    gap: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaLine: {
    fontSize: 13,
    fontWeight: '600',
  },
  metaSubline: {
    fontSize: 12,
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 11,
    fontWeight: '500',
  },
});

function safeLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (!value.trim()) return '';
  return value.trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPercent(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function formatFreshness(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${Math.round(value)} / 100`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  const relative = formatRelativeDistance(date);
  return `${relative} • ${date.toLocaleString()}`;
}

function formatRelativeDistance(target: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 1) return 'Just now';
  if (Math.abs(diffMinutes) < 60) {
    return diffMinutes > 0 ? `${Math.abs(diffMinutes)} min ago` : `in ${Math.abs(diffMinutes)} min`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return diffHours > 0 ? `${Math.abs(diffHours)} hrs ago` : `in ${Math.abs(diffHours)} hrs`;
  }
  const diffDays = Math.round(diffHours / 24);
  return diffDays > 0 ? `${diffDays} days ago` : `in ${Math.abs(diffDays)} days`;
}

function withAlpha(hexColor: string, alpha: number): string {
  if (!hexColor || typeof hexColor !== 'string') {
    return `rgba(100, 116, 139, ${alpha})`;
  }
  const raw = hexColor.replace('#', '');
  let hex = raw;
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (hex.length === 8) {
    hex = hex.slice(2);
  }
  if (hex.length !== 6) {
    return `rgba(100, 116, 139, ${alpha})`;
  }
  const bigint = Number.parseInt(hex, 16);
  if (Number.isNaN(bigint)) {
    return `rgba(100, 116, 139, ${alpha})`;
  }
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default FoodInspectionPanel;
