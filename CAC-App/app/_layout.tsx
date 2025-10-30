import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from '@/app/context/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

const STORAGE_KEY = 'hasSeenIntro_v2';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Mode = 'light' | 'dark';

type Palette = {
  gradient: [string, string, string];
  buttonGradient: [string, string];
  surface: string;
  spinner: string;
  statusBarStyle: 'light' | 'dark';
  pulse: string;
  halo: string;
  textPrimary: string;
  textMuted: string;
  inputBg: string;
  inputBorder: string;
  cardBackground: string;
  cardBorder: string;
  link: string;
  accentOn: string;
  roleActiveBg: string;
  roleActiveBorder: string;
  roleIconActive: string;
  roleIconInactive: string;
  roleDescription: string;
};

const ROLE_OPTIONS: Array<{
  value: string;
  label: string;
  description: string;
  icon: IoniconName;
}> = [
  {
    value: 'charity',
    label: 'Aid seeker',
    description: 'Families, shelters, or community orgs requesting meals.',
    icon: 'heart',
  },
  {
    value: 'donor',
    label: 'Food donor',
    description: 'Restaurants, groceries, or farms sharing surplus food.',
    icon: 'restaurant',
  },
  {
    value: 'volunteer',
    label: 'Volunteer driver',
    description: 'Route captains helping transport donations.',
    icon: 'car',
  },
];

const getPalette = (mode: Mode): Palette =>
  mode === 'dark'
    ? {
        gradient: ['#071426', '#0B1A31', '#101F3C'],
        buttonGradient: ['#6366F1', '#8B5CF6'],
        surface: '#0B1626',
        spinner: '#8B5CF6',
        statusBarStyle: 'light',
        pulse: '#4F46E5',
        halo: 'rgba(99,102,241,0.24)',
        textPrimary: '#E2E8F0',
        textMuted: '#A5B4FC',
        inputBg: 'rgba(15,23,42,0.58)',
        inputBorder: 'rgba(148,163,184,0.25)',
        cardBackground: 'rgba(15,23,42,0.82)',
        cardBorder: 'rgba(148,163,184,0.25)',
        link: '#C7D2FE',
        accentOn: '#F8FAFC',
        roleActiveBg: 'rgba(79,70,229,0.32)',
        roleActiveBorder: '#6366F1',
        roleIconActive: '#E0E7FF',
        roleIconInactive: '#94A3B8',
        roleDescription: '#C7D2FE',
      }
    : {
        gradient: ['#EEF2FF', '#E0F2FE', '#F8FAFC'],
        buttonGradient: ['#4F46E5', '#6366F1'],
        surface: '#F8FAFC',
        spinner: '#4F46E5',
        statusBarStyle: 'dark',
        pulse: '#4F46E5',
        halo: 'rgba(99,102,241,0.16)',
        textPrimary: '#0F172A',
        textMuted: '#64748B',
        inputBg: 'rgba(255,255,255,0.9)',
        inputBorder: 'rgba(148,163,184,0.35)',
        cardBackground: 'rgba(255,255,255,0.95)',
        cardBorder: 'rgba(148,163,184,0.3)',
        link: '#4338CA',
        accentOn: '#FFFFFF',
        roleActiveBg: 'rgba(99,102,241,0.16)',
        roleActiveBorder: '#6366F1',
        roleIconActive: '#4338CA',
        roleIconInactive: '#94A3B8',
        roleDescription: '#475569',
      };

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    fullscreen: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: palette.surface,
    },
    placeholder: { height: 1 },
    introContainer: { alignItems: 'center' },
    logoPulse: { width: 96, height: 96, borderRadius: 48, backgroundColor: palette.pulse },
    slogan: {
      marginTop: 16,
      fontSize: 16,
      textAlign: 'center',
      paddingHorizontal: 24,
      color: palette.textPrimary,
    },
    gradient: { flex: 1 },
    flex: { flex: 1 },
    authScroll: {
      flexGrow: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 48,
    },
    authCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 24,
      padding: 28,
      backgroundColor: palette.cardBackground,
      borderWidth: 1,
      borderColor: palette.cardBorder,
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 18 },
      elevation: 16,
    },
    logoHalo: {
      width: 72,
      height: 72,
      borderRadius: 24,
      backgroundColor: palette.halo,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 18,
    },
    logoImage: { width: 44, height: 44, borderRadius: 12 },
    brandTitle: { fontSize: 22, fontWeight: '700', color: palette.textPrimary, textAlign: 'center' },
    brandSubtitle: {
      fontSize: 14,
      color: palette.textMuted,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 28,
    },
    formHeader: { width: '100%', fontSize: 20, fontWeight: '600', color: palette.textPrimary, marginBottom: 16 },
    input: {
      width: '100%',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.inputBg,
      color: palette.textPrimary,
      fontSize: 15,
      marginBottom: 12,
    },
    roleSection: { width: '100%', marginTop: 8, marginBottom: 12 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginBottom: 12,
    },
    roleOptions: { width: '100%' },
    roleOption: {
      width: '100%',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.inputBg,
      padding: 16,
    },
    roleOptionActive: { borderColor: palette.roleActiveBorder, backgroundColor: palette.roleActiveBg },
    roleOptionSpacing: { marginBottom: 12 },
    roleOptionHeader: { flexDirection: 'row', alignItems: 'center' },
    roleOptionLabel: { marginLeft: 10, fontSize: 16, fontWeight: '600', color: palette.textPrimary },
    roleOptionLabelActive: { color: palette.textPrimary },
    roleOptionDescription: { marginTop: 6, fontSize: 13, lineHeight: 18, color: palette.roleDescription },
    primaryButtonWrapper: { width: '100%', borderRadius: 12, overflow: 'hidden', marginTop: 12 },
    primaryButtonWrapperDisabled: { opacity: 0.7 },
    primaryButton: { width: '100%', paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    primaryButtonText: { color: palette.accentOn, fontSize: 16, fontWeight: '600' },
    linkRow: { marginTop: 24, alignSelf: 'center' },
    linkText: { color: palette.link, fontSize: 14, fontWeight: '500' },
  });

function InnerRoot() {
  const colorScheme = useColorScheme();
  const [showIntro, setShowIntro] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('donor');
  const [busy, setBusy] = useState(false);
  const auth = useAuth() as any;
  const router = useRouter();
  const segments = useSegments();

  const pulse = useRef(new Animated.Value(1)).current;
  const mode: Mode = colorScheme === 'dark' ? 'dark' : 'light';
  const palette = useMemo(() => getPalette(mode), [mode]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const statusBarStyle = palette.statusBarStyle;
  const stackContentStyle = useMemo(
    () => ({ paddingTop: Platform.OS === 'ios' ? 14 : 9, paddingBottom: 0 }),
    [],
  );

  useEffect(() => {
    let mounted = true;

    async function checkStorage() {
      try {
        const val = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;
        if (!val) {
          setShowIntro(true);
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulse, { toValue: 1.05, duration: 600, useNativeDriver: true }),
              Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
            ])
          ).start();

          setTimeout(async () => {
            if (!mounted) return;
            Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
            setShowIntro(false);
            setIntroDone(true);
            try {
              await AsyncStorage.setItem(STORAGE_KEY, '1');
            } catch {
              // ignore storage write errors
            }
          }, 1800);
        } else {
          setIntroDone(true);
        }
      } catch {
        setIntroDone(true);
      }
    }

    checkStorage();
    return () => {
      mounted = false;
    };
  }, [pulse]);

  async function handleLogin() {
    setBusy(true);
    try {
      await auth.login(email, password);
    } catch (e: any) {
      console.warn('Login failed', e?.message ?? e);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup() {
    setBusy(true);
    try {
      await auth.signup(email, password, role);
    } catch (e: any) {
      console.warn('Signup failed', e?.message ?? e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!auth?.hydrated) {
      return;
    }

    const currentSegments = Array.isArray(segments) ? segments : [];
    const rootSegment = currentSegments[0];
    const roleSegment = currentSegments[1];

    if (!auth?.token) {
      if (rootSegment === '(tabs)') {
        router.replace('/');
      }
      return;
    }

    const targetPath: Href = auth.role === 'donor'
      ? '/(tabs)/donors/home'
      : auth.role === 'volunteer'
      ? '/(tabs)/volunteers/home'
      : '/(tabs)/families/home';

    const expectedRoleSegment = auth.role === 'donor'
      ? 'donors'
      : auth.role === 'volunteer'
      ? 'volunteers'
      : 'families';

    if (rootSegment !== '(tabs)' || roleSegment !== expectedRoleSegment) {
      router.replace(targetPath);
    }
  }, [auth?.hydrated, auth?.token, auth?.role, segments, router]);

  if (!introDone) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.fullscreen}>
          {showIntro ? (
            <View style={styles.introContainer}>
              <Animated.View style={[styles.logoPulse, { transform: [{ scale: pulse }] }]} />
              <Text style={styles.slogan}>Smarter food redistribution for stronger communities.</Text>
            </View>
          ) : (
            <View style={styles.placeholder} />
          )}
        </View>
        <StatusBar style={statusBarStyle} />
      </ThemeProvider>
    );
  }

  if (!auth?.hydrated) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.fullscreen}>
          <ActivityIndicator size="large" color={palette.spinner} />
        </View>
        <StatusBar style={statusBarStyle} />
      </ThemeProvider>
    );
  }

  if (!auth.token && auth.loading) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.fullscreen}>
          <ActivityIndicator size="large" color={palette.spinner} />
        </View>
        <StatusBar style={statusBarStyle} />
      </ThemeProvider>
    );
  }

  if (!auth.token) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <LinearGradient
          colors={palette.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              contentContainerStyle={styles.authScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.authCard}>
                <View style={styles.logoHalo}>
                  <Image source={require('../assets/images/icon.png')} style={styles.logoImage} />
                </View>
                <Text style={styles.brandTitle}>FreshBay</Text>
                <Text style={styles.brandSubtitle}>
                  Smarter coordination for donors, volunteers, and neighbors in need.
                </Text>
                <Text style={styles.formHeader}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
                <TextInput
                  placeholder="Work email"
                  placeholderTextColor={palette.textMuted}
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  selectionColor={palette.roleActiveBorder}
                />
                <TextInput
                  placeholder="Password"
                  placeholderTextColor={palette.textMuted}
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  selectionColor={palette.roleActiveBorder}
                />

                {isSignup ? (
                  <View style={styles.roleSection}>
                    <Text style={styles.sectionLabel}>Join as</Text>
                    <View style={styles.roleOptions}>
                      {ROLE_OPTIONS.map((option, index) => {
                        const active = role === option.value;
                        const isLast = index === ROLE_OPTIONS.length - 1;
                        return (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.roleOption,
                              active && styles.roleOptionActive,
                              !isLast && styles.roleOptionSpacing,
                            ]}
                            onPress={() => setRole(option.value)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.roleOptionHeader}>
                              <Ionicons
                                name={option.icon}
                                size={20}
                                color={active ? palette.roleIconActive : palette.roleIconInactive}
                              />
                              <Text style={[styles.roleOptionLabel, active && styles.roleOptionLabelActive]}>
                                {option.label}
                              </Text>
                            </View>
                            <Text style={styles.roleOptionDescription}>{option.description}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.primaryButtonWrapper, busy && styles.primaryButtonWrapperDisabled]}
                  onPress={isSignup ? handleSignup : handleLogin}
                  disabled={busy}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={palette.buttonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryButton}
                  >
                    {busy ? (
                      <ActivityIndicator color={palette.accentOn} />
                    ) : (
                      <Text style={styles.primaryButtonText}>{isSignup ? 'Sign up' : 'Log in'}</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setIsSignup((s) => !s)} style={styles.linkRow}>
                  <Text style={styles.linkText}>
                    {isSignup ? 'Already have an account? Log in' : 'New to FreshBay? Create account'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
          <StatusBar style={statusBarStyle} />
        </LinearGradient>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ contentStyle: stackContentStyle }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style={statusBarStyle} />
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <InnerRoot />
    </AuthProvider>
  );
}
