import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getVolunteerActiveDeliveries, updateVolunteerTaskStatus } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const STATUS_FLOW: Record<string, string | null> = {
  assigned: 'en_route',
  en_route: 'picked_up',
  picked_up: 'delivering',
  delivering: 'completed',
  completed: null,
  cancelled: null,
};

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Queued',
  en_route: 'On the way',
  picked_up: 'Picked up',
  delivering: 'Delivering',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function VolunteersActive() {
  const { token } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [photos, setPhotos] = useState<Record<number, string>>({});

  const loadActive = useCallback(async () => {
    if (!token) return;
    setLoading((prev) => (!refreshing ? true : prev));
    try {
      const res = await getVolunteerActiveDeliveries(token);
      setTasks(Array.isArray(res?.results) ? res.results : []);
    } catch (error) {
      console.warn('Unable to load active deliveries', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, refreshing]);

  useEffect(() => {
    loadActive();
  }, [loadActive]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadActive();
  }, [loadActive]);

  async function handleAdvance(task: any) {
    if (!token) return;
    const nextStatus = STATUS_FLOW[task.status];
    if (!nextStatus) {
      Alert.alert('All done', 'This delivery is already complete.');
      return;
    }
    const payload: any = { task_id: task.id, status: nextStatus };
    if (nextStatus === 'completed' && photos[task.id]) {
      payload.completion_photo_url = photos[task.id];
    }
    try {
      await updateVolunteerTaskStatus(token, payload);
      await loadActive();
    } catch (error: any) {
      Alert.alert('Update failed', error?.message ?? 'Try again in a moment.');
    }
  }

  const ListHeader = useMemo(
    () => (
      <View style={styles.header}>
        <Text style={styles.title}>Active deliveries</Text>
        <Text style={styles.subtitle}>
          Track progress, drop photo proof, and mark each handoff complete. Efficiency score updates automatically.
        </Text>
      </View>
    ),
    [styles]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={tasks}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => {
          const nextStatus = STATUS_FLOW[item.status];
          const statusLabel = STATUS_LABELS[item.status] ?? item.status;
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardStatus}>{statusLabel}</Text>
              </View>
              <Text style={styles.cardMeta}>
                {item.pickup_address}
                {'\n'}→ {item.dropoff_address}
              </Text>
              <Text style={styles.cardHelper}>Distance: {item.distance_miles} mi • Load: {item.load_size}</Text>
              <Text style={styles.cardHelper}>Pickup ETA: {item.scheduled_start ? new Date(item.scheduled_start).toLocaleTimeString() : 'ASAP'}</Text>

              {nextStatus === 'completed' ? (
                <View style={styles.photoRow}>
                  <TextInput
                    placeholder="Photo proof URL (optional)"
                    placeholderTextColor={palette.icon}
                    value={photos[item.id] ?? ''}
                    onChangeText={(value) => setPhotos((prev) => ({ ...prev, [item.id]: value }))}
                    style={styles.photoInput}
                    autoCapitalize="none"
                  />
                </View>
              ) : null}

              <View style={styles.footerRow}>
                <Text style={styles.nextStepLabel}>
                  Next step: {nextStatus ? STATUS_LABELS[nextStatus] ?? nextStatus : 'Completed'}
                </Text>
                {nextStatus ? (
                  <TouchableOpacity style={styles.advanceButton} onPress={() => handleAdvance(item)}>
                    <Text style={styles.advanceButtonText}>Mark {STATUS_LABELS[nextStatus] ?? nextStatus}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={palette.tint} />
              <Text style={styles.emptyText}>Syncing your assignments…</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No active deliveries yet. Accept a task to start driving.</Text>
            </View>
          )
        }
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.tint} />}
      />
    </SafeAreaView>
  );
}

const createStyles = (palette: typeof Colors.light) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.background,
    },
    content: {
      paddingBottom: 64,
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: 32,
      paddingBottom: 18,
      gap: 12,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: palette.text,
      letterSpacing: -0.5,
    },
    subtitle: {
      color: palette.icon,
      fontSize: 14,
      lineHeight: 20,
    },
    card: {
      marginHorizontal: 24,
      marginBottom: 16,
      borderRadius: 20,
      padding: 20,
      backgroundColor: colorWithOpacity(palette.tint, 0.08),
      gap: 12,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: palette.text,
    },
    cardStatus: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.tint,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    cardMeta: {
      fontSize: 13,
      color: palette.text,
      lineHeight: 20,
    },
    cardHelper: {
      fontSize: 12,
      color: palette.icon,
    },
    photoRow: {
      marginTop: 4,
    },
    photoInput: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colorWithOpacity(palette.background, 0.9),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colorWithOpacity(palette.icon, 0.2),
      color: palette.text,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
    },
    nextStepLabel: {
      fontSize: 12,
      color: palette.icon,
    },
    advanceButton: {
      backgroundColor: palette.tint,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    advanceButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 13,
    },
    emptyState: {
      paddingTop: 160,
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      color: palette.icon,
      textAlign: 'center',
      paddingHorizontal: 48,
      lineHeight: 20,
    },
  });

function colorWithOpacity(hex: string, opacity: number) {
  const normalizedOpacity = Math.min(Math.max(opacity, 0), 1);
  const alpha = Math.round(normalizedOpacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}
