import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';

import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Role = 'donor' | 'volunteer' | 'charity';
type IconName = keyof typeof Ionicons.glyphMap;

type QuickLink = {
  id: string;
  title: string;
  description: string;
  href: Href;
  icon: IconName;
  tint: string;
  roles: Role[];
};

type ChecklistTone = 'primary' | 'warning' | 'success';

type ChecklistItem = {
  id: string;
  label: string;
  icon: IconName;
  tone: ChecklistTone;
};

const QUICK_LINKS: QuickLink[] = [
  {
    id: 'donor-donate',
    title: 'Schedule a donation',
    description: 'Post surplus food and set the pickup window.',
    href: '/(tabs)/donors/donate',
    icon: 'gift',
    tint: '#4338CA',
    roles: ['donor'],
  },
  {
    id: 'donor-analytics',
    title: 'Impact & analytics',
    description: 'Review meals provided and emissions saved this week.',
    href: '/(tabs)/donors/analytics',
    icon: 'stats-chart',
    tint: '#7C3AED',
    roles: ['donor'],
  },
  {
    id: 'charity-available',
    title: 'Claim available food',
    description: 'Reserve donations in your delivery zone before they expire.',
    href: '/(tabs)/families/available',
    icon: 'basket',
    tint: '#0EA5E9',
    roles: ['charity'],
  },
  {
    id: 'charity-aid',
    title: 'Aid programs',
    description: 'Track scheduled deliveries and benefits for your families.',
    href: '/(tabs)/families/aid',
    icon: 'heart',
    tint: '#EF4444',
    roles: ['charity'],
  },
  {
    id: 'volunteer-routes',
    title: "Today's route",
    description: 'Preview your assigned pickups and drop-offs.',
    href: '/(tabs)/volunteers/home',
    icon: 'map',
    tint: '#10B981',
    roles: ['volunteer'],
  },
  {
    id: 'volunteer-tasks',
    title: 'Find a task',
    description: 'Grab an open pickup slot that matches your schedule.',
    href: '/(tabs)/volunteers/tasks',
    icon: 'flash',
    tint: '#F59E0B',
    roles: ['volunteer'],
  },
];

const PROFILE_PATH = {
  donor: '/(tabs)/donors/profile',
  volunteer: '/(tabs)/volunteers/profile',
  charity: '/(tabs)/families/profile',
} satisfies Record<Role, Href>;

const ROLE_TITLES = {
  donor: 'Donor',
  volunteer: 'Volunteer',
  charity: 'Family',
} satisfies Record<Role, string>;

const HERO_SUBTITLES = {
  donor: 'Coordinate pickups, review inspections, and keep surplus moving.',
  volunteer: 'Sync your route, confirm stops, and keep cold chain notes handy.',
  charity: 'Track reservations, claim new donations, and manage family outreach.',
} satisfies Record<Role, string>;

const CHECKLIST: Record<Role, ChecklistItem[]> = {
  donor: [
    {
      id: 'donor-windows',
      label: "Confirm today's pickup windows before volunteers launch.",
      icon: 'time',
      tone: 'warning',
    },
    {
      id: 'donor-logs',
      label: 'Upload temperature and freshness logs for ready items.',
      icon: 'thermometer',
      tone: 'primary',
    },
    {
      id: 'donor-outreach',
      label: 'Message waiting families about reservations nearing expiry.',
      icon: 'chatbox',
      tone: 'success',
    },
  ],
  volunteer: [
    {
      id: 'volunteer-sync',
      label: 'Sync the latest route map and confirm fuel or cargo space.',
      icon: 'navigate',
      tone: 'primary',
    },
    {
      id: 'volunteer-scan',
      label: 'Scan pickups for proof-of-transfer at each location.',
      icon: 'qr-code',
      tone: 'warning',
    },
    {
      id: 'volunteer-safety',
      label: 'Review cold chain notes and flag issues in inspection drafts.',
      icon: 'shield-checkmark',
      tone: 'success',
    },
  ],
  charity: [
    {
      id: 'charity-reserve',
      label: 'Reserve high freshness donations before afternoon cutoff.',
      icon: 'cart',
      tone: 'primary',
    },
    {
      id: 'charity-alerts',
      label: 'Enable pickup alerts for families with dietary priorities.',
      icon: 'notifications',
      tone: 'warning',
    },
    {
      id: 'charity-coord',
      label: 'Coordinate volunteers for bulk claims and delivery windows.',
      icon: 'people',
      tone: 'success',
    },
  ],
};

function withOpacity(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return hex;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function inferHost() {
  const expoConfig = Constants.expoConfig || Constants.manifest || null;
  const expoExtra =
    Constants.manifest2?.extra?.expoGo ||
    Constants.expoConfig?.extra?.expoGo ||
    expoConfig?.extra?.expoGo ||
    null;
  const debuggerHost =
    expoExtra?.debuggerHost ||
    expoConfig?.hostUri ||
    expoConfig?.debuggerHost ||
    expoExtra?.packagerHost ||
    null;

  if (typeof debuggerHost === 'string') {
    return debuggerHost.split(':')[0];
  }

  const scriptURL = (NativeModules as any)?.SourceCode?.scriptURL;
  if (typeof scriptURL === 'string') {
    const match = scriptURL.match(/https?:\/\/(.*?):\d+/);
    if (match && match[1]) {
      return match[1];
    }
  }

  if (Platform.OS === 'android') return '10.0.2.2';
  return '127.0.0.1';
}

function createStyles(palette: typeof Colors.light, isDark: boolean) {
  const baseCard = {
    backgroundColor: palette.card,
    borderRadius: 20,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? 'rgba(148, 163, 184, 0.18)' : 'transparent',
    shadowColor: isDark ? 'transparent' : '#0F172A',
    shadowOpacity: isDark ? 0 : 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: isDark ? 0 : 4,
  } as const;

  const compactCard = {
    ...baseCard,
    borderRadius: 16,
    padding: 16,
  } as const;

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 32,
      paddingTop: 24,
      gap: 24,
    },
    heroCard: {
      ...baseCard,
      padding: 20,
      gap: 12,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    heroBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '600',
      letterSpacing: -0.4,
    },
    heroSubtitle: {
      fontSize: 15,
      lineHeight: 22,
    },
    heroStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 6,
    },
    statusIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroStatusLabel: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 2,
    },
    statusText: {
      fontSize: 13,
      lineHeight: 20,
    },
    section: {
      gap: 12,
    },
    sectionHeading: {
      fontSize: 18,
      fontWeight: '600',
    },
    sectionSubtitle: {
      fontSize: 14,
      lineHeight: 20,
    },
    quickLinksWrapper: {
      gap: 12,
    },
    quickLinkCard: {
      ...compactCard,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconBadge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLinkCopy: {
      flex: 1,
      gap: 2,
    },
    quickLinkTitle: {
      fontSize: 16,
      fontWeight: '600',
    },
    quickLinkDescription: {
      fontSize: 14,
      lineHeight: 20,
    },
    checklistCard: {
      ...baseCard,
      padding: 20,
      gap: 18,
    },
    checklistHeader: {
      gap: 4,
    },
    checklistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    checklistIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checklistText: {
      flex: 1,
      fontSize: 15,
      lineHeight: 21,
    },
    loaderContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 12,
    },
    loaderHeading: {
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
    },
    loaderText: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
  });
}

export default function HomeScreen() {
  const { role, loading } = useAuth();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const isDark = colorScheme === 'dark';
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);

  const typedRole: Role | null =
    role === 'donor' || role === 'volunteer' || role === 'charity' ? role : null;

  const backendUrl = useMemo(() => {
    const extra =
      ((Constants.expoConfig as any)?.extra ??
        (Constants.manifest as any)?.extra ??
        (Constants.manifest2 as any)?.extra ??
        {}) as Record<string, any>;

    const explicit =
      (typeof extra.EXPO_PUBLIC_API_BASE_URL === 'string' && extra.EXPO_PUBLIC_API_BASE_URL) ||
      (typeof extra.API_BASE_URL === 'string' && extra.API_BASE_URL) ||
      (typeof extra.apiBaseUrl === 'string' && extra.apiBaseUrl) ||
      null;

    if (explicit) {
      return explicit;
    }

    const envProcess = (globalThis as any)?.process?.env;
    if (envProcess) {
      const fromEnv = envProcess.EXPO_PUBLIC_API_BASE_URL || envProcess.API_BASE_URL;
      if (typeof fromEnv === 'string' && fromEnv.length > 0) {
        return fromEnv;
      }
    }

    const host = inferHost();
    return `http://${host}:8000`;
  }, []);

  const toneColors = useMemo(
    () => ({
      primary: palette.tint,
      warning: palette.warning,
      success: palette.success,
    }),
    [palette],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator color={palette.tint} />
          <Text style={[styles.loaderText, { color: palette.icon }]}>Loading your dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!typedRole) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loaderContainer}>
          <Ionicons name="log-in" size={24} color={palette.tint} />
          <Text style={[styles.loaderHeading, { color: palette.text }]}>Sign in to continue</Text>
          <Text style={[styles.loaderText, { color: palette.icon }]}>Choose a role to unlock quick links and live data.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const heroSubtitle = HERO_SUBTITLES[typedRole];
  const roleTitle = ROLE_TITLES[typedRole];
  const checklistItems = CHECKLIST[typedRole];

  const quickLinks = useMemo(() => {
    const base = QUICK_LINKS.filter((link) => link.roles.includes(typedRole));
    base.push({
      id: 'profile',
      title: 'Manage profile',
      description: 'Adjust contact info, zones, and notification preferences.',
      href: PROFILE_PATH[typedRole],
      icon: 'person-circle',
      tint: palette.tint,
      roles: [typedRole],
    });
    return base;
  }, [typedRole, palette.tint]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Ionicons name="leaf" size={18} color={palette.tint} />
            <Text style={[styles.heroBadgeText, { color: palette.tint }]}>{roleTitle} operations</Text>
          </View>
          <Text style={[styles.heroTitle, { color: palette.text }]}>{roleTitle} command center</Text>
          <Text style={[styles.heroSubtitle, { color: palette.icon }]}>{heroSubtitle}</Text>
          <View style={styles.heroStatusRow}>
            <View
              style={[
                styles.statusIcon,
                { backgroundColor: withOpacity(palette.success, isDark ? 0.28 : 0.15) },
              ]}
            >
              <Ionicons name="cloud-done" size={18} color={palette.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroStatusLabel, { color: palette.success }]}>Live data connected</Text>
              <Text style={[styles.statusText, { color: palette.icon }]} numberOfLines={2}>
                {backendUrl}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeading, { color: palette.text }]}>Quick links</Text>
          <Text style={[styles.sectionSubtitle, { color: palette.icon }]}>Jump straight into the flows you manage most.</Text>
          <View style={styles.quickLinksWrapper}>
            {quickLinks.map((link) => (
              <Link key={link.id} href={link.href} asChild>
                <TouchableOpacity style={styles.quickLinkCard} activeOpacity={0.86}>
                  <View
                    style={[
                      styles.iconBadge,
                      { backgroundColor: withOpacity(link.tint, isDark ? 0.28 : 0.15) },
                    ]}
                  >
                    <Ionicons name={link.icon} size={20} color={link.tint} />
                  </View>
                  <View style={styles.quickLinkCopy}>
                    <Text style={[styles.quickLinkTitle, { color: palette.text }]}>{link.title}</Text>
                    <Text style={[styles.quickLinkDescription, { color: palette.icon }]}>{link.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={palette.icon} />
                </TouchableOpacity>
              </Link>
            ))}
          </View>
        </View>

        <View style={styles.checklistCard}>
          <View style={styles.checklistHeader}>
            <Text style={[styles.sectionHeading, { color: palette.text }]}>Operational checklist</Text>
            <Text style={[styles.sectionSubtitle, { color: palette.icon }]}>Keep today on track with the latest priorities.</Text>
          </View>
          {checklistItems.map((item) => {
            const tone = toneColors[item.tone];
            return (
              <View key={item.id} style={styles.checklistRow}>
                <View
                  style={[
                    styles.checklistIcon,
                    { backgroundColor: withOpacity(tone, isDark ? 0.28 : 0.15) },
                  ]}
                >
                  <Ionicons name={item.icon} size={18} color={tone} />
                </View>
                <Text style={[styles.checklistText, { color: palette.text }]}>{item.label}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
