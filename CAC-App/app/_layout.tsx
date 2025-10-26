import React, { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '@/app/context/auth';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

const STORAGE_KEY = 'hasSeenIntro_v2';

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

  useEffect(() => {
    let mounted = true;

    async function checkStorage() {
      try {
        const val = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;
        if (!val) {
          // show animated intro once
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
              // ignore set errors
            }
          }, 1800);
        } else {
          setIntroDone(true);
        }
      } catch {
        // if storage fails, just proceed
        setIntroDone(true);
      }
    }

    checkStorage();
    return () => {
      mounted = false;
    };
  }, [pulse]);

  // handlers that call the API
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

  // show the intro animation until it's done (first-time only)
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
      </ThemeProvider>
    );
  }

  if (!auth?.hydrated) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.fullscreen}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </ThemeProvider>
    );
  }

  if (!auth.token && auth.loading) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.fullscreen}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </ThemeProvider>
    );
  }

  // If intro is done but user not authenticated, show auth UI
  if (!auth.token) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.container}>
          <Image source={require('../assets/images/icon.png')} style={styles.logoLarge} />
          <Text style={styles.appNameLarge}>FreshBay CAC</Text>
          <Text style={styles.header}>{isSignup ? 'Create account' : 'Welcome back'}</Text>
          <TextInput
            placeholder="email"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            placeholder="password"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {isSignup ? (
            <View style={{ width: '100%', marginBottom: 12 }}>
              <Text style={{ marginBottom: 6 }}>Role</Text>
                <View>
                {[
                  { value: 'charity', label: 'Families / Individuals in need' },
                  { value: 'donor', label: 'Donors (restaurants, groceries, farms)' },
                  { value: 'volunteer', label: 'Volunteers / Drivers' },
                ].map((option, idx, arr) => (
                  <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.roleButton,
                    { width: '100%', marginBottom: idx === arr.length - 1 ? 0 : 8 },
                    role === option.value && styles.roleSelected,
                  ]}
                  onPress={() => setRole(option.value)}
                  >
                  <Text style={role === option.value ? styles.roleTextSelected : styles.roleText}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
                </View>
            </View>
          ) : null}

          <TouchableOpacity style={styles.primaryButton} onPress={isSignup ? handleSignup : handleLogin} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{isSignup ? 'Sign up' : 'Log in'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsSignup((s) => !s)} style={styles.linkRow}>
            <Text style={styles.linkText}>{isSignup ? 'Have an account? Log in' : 'New here? Create account'}</Text>
          </TouchableOpacity>

          <StatusBar style="auto" />
        </View>
      </ThemeProvider>
    );
  }

  // Authenticated: render the rest of the app
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
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

const styles = StyleSheet.create({
  fullscreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loaderContainer: { alignItems: 'center' },
  logoCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#4F46E5' },
  appTitle: { marginTop: 12, fontSize: 20, fontWeight: '700', color: '#111827' },
  placeholder: { height: 1 },
  container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: { fontSize: 28, fontWeight: '700', marginTop: 0, marginBottom: 24 },
  input: { width: '100%', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  primaryButton: { width: '100%', padding: 14, backgroundColor: '#4F46E5', borderRadius: 8, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  linkRow: { marginTop: 12 },
  linkText: { color: '#4F46E5' },
  introContainer: { alignItems: 'center' },
  logoPulse: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#4F46E5' },
  slogan: { marginTop: 16, fontSize: 16, textAlign: 'center', paddingHorizontal: 24, color: '#111827' },
  roleButton: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', width: '48%', alignItems: 'center' },
  roleSelected: { backgroundColor: '#eef2ff', borderColor: '#4F46E5' },
  roleText: { color: '#111827' },
  roleTextSelected: { color: '#4F46E5', fontWeight: '600' },
  logoLarge: { width: 72, height: 72, borderRadius: 12, marginBottom: 8 },
  appNameLarge: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#0F172A' },
});
