import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { acceptVolunteerTask, getVolunteerAvailableTasks } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Filters = {
  maxDistance?: number;
  urgency?: string;
  load?: string;
};

const DISTANCE_OPTIONS = [5, 10, 20, 40];
const URGENCY_OPTIONS = ['critical', 'high', 'medium', 'low'];
const LOAD_OPTIONS = ['small', 'medium', 'large'];

export default function VolunteersTasks() {
  const { token } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [filters, setFilters] = useState<Filters>({});
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!token) return;
    setLoading((prev) => (!refreshing ? true : prev));
    try {
      const res = await getVolunteerAvailableTasks(token, filters);
      setTasks(Array.isArray(res?.results) ? res.results : []);
    } catch (error) {
      console.warn('Unable to fetch volunteer tasks', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, filters, refreshing]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const toggleDistance = useCallback(
    (value: number) => {
      setFilters((prev) => ({ ...prev, maxDistance: prev.maxDistance === value ? undefined : value }));
    },
    []
  );

  const toggleUrgency = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, urgency: prev.urgency === value ? undefined : value }));
  }, []);

  const toggleLoad = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, load: prev.load === value ? undefined : value }));
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTasks();
  }, [loadTasks]);

  async function handleAccept(taskId: number) {
    if (!token) return;
    try {
      await acceptVolunteerTask(token, taskId);
      Alert.alert('Task accepted', 'We added it to your route.');
      await loadTasks();
    } catch (error: any) {
      Alert.alert('Unable to accept task', error?.message ?? 'Please try again');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={tasks}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Available tasks nearby</Text>
            <Text style={styles.subtitle}>Grab an assignment to auto-add it to your navigation stack.</Text>

            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Distance</Text>
              <View style={styles.filterRow}>
                {DISTANCE_OPTIONS.map((option) => {
                  const active = filters.maxDistance === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => toggleDistance(option)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{option} mi</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Urgency</Text>
              <View style={styles.filterRow}>
                {URGENCY_OPTIONS.map((option) => {
                  const active = filters.urgency === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => toggleUrgency(option)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{option.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Load size</Text>
              <View style={styles.filterRow}>
                {LOAD_OPTIONS.map((option) => {
                  const active = filters.load === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => toggleLoad(option)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{option}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.distance_miles} mi • {item.urgency?.toUpperCase()} • {item.load_size}
              </Text>
              <Text style={styles.cardAddress}>
                {item.pickup_address}
                {'\n'}→ {item.dropoff_address}
              </Text>
              <Text style={styles.cardHelper}>Pickup window: {item.scheduled_start ? new Date(item.scheduled_start).toLocaleTimeString() : 'asap'}</Text>
            </View>
            <TouchableOpacity style={styles.acceptButton} onPress={() => handleAccept(item.id)}>
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={palette.tint} />
              <Text style={styles.emptyText}>Scanning for opportunities…</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No tasks match your filters. Adjust them to see more pickups.</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
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
    header: {
      paddingHorizontal: 24,
      paddingTop: 32,
      paddingBottom: 16,
      gap: 18,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: palette.text,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 14,
      color: palette.icon,
      lineHeight: 20,
    },
    filterGroup: {
      gap: 10,
    },
    filterLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.icon,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.icon,
    },
    filterChipActive: {
      backgroundColor: palette.tint,
      borderColor: palette.tint,
    },
    filterChipText: {
      color: palette.icon,
      fontWeight: '600',
      textTransform: 'uppercase',
      fontSize: 12,
      letterSpacing: 0.6,
    },
    filterChipTextActive: {
      color: '#fff',
    },
    listContent: {
      paddingBottom: 48,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 20,
      marginHorizontal: 24,
      marginBottom: 16,
      borderRadius: 20,
      backgroundColor: colorWithOpacity(palette.tint, 0.08),
      gap: 18,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: palette.text,
    },
    cardMeta: {
      fontSize: 12,
      color: palette.icon,
      letterSpacing: 0.4,
    },
    cardAddress: {
      fontSize: 13,
      color: palette.text,
    },
    cardHelper: {
      fontSize: 12,
      color: palette.icon,
      marginTop: 4,
    },
    acceptButton: {
      backgroundColor: palette.tint,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    acceptButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    emptyState: {
      paddingTop: 120,
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
