import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  login as loginRequest,
  signup as signupRequest,
  logout as logoutRequest,
  getProfile,
} from '@/app/api';

const TOKEN_KEY = 'auth_token_v1';
const ROLE_KEY = 'user_role_v1';

const normalizeRole = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (['donor', 'donors'].includes(normalized)) return 'donor';
  if (['volunteer', 'volunteers'].includes(normalized)) return 'volunteer';
  if (['family', 'families', 'recipient', 'recipients', 'charity', 'charities'].includes(normalized)) return 'charity';
  return null;
};

type AuthContextValue = {
  token: string | null;
  role: string | null;
  loading: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<any>;
  signup: (email: string, password: string, role: string) => Promise<any>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [resolvingRole, setResolvingRole] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tk = await AsyncStorage.getItem(TOKEN_KEY);
        const r = await AsyncStorage.getItem(ROLE_KEY);
        if (!mounted) return;
        if (tk) setToken(tk);
        const normalizedRole = normalizeRole(r);
        if (normalizedRole) {
          setRole(normalizedRole);
        } else if (r) {
          await AsyncStorage.removeItem(ROLE_KEY);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) {
          setLoading(false);
          setHydrated(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const res = await loginRequest(email, password);
    if (res?.token) {
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    }
    // backend may return role
    let r = normalizeRole(res?.role || null);
    if (!r && res?.token) {
      try {
        const profile = await getProfile(res.token);
        r = normalizeRole(profile?.role ?? null);
      } catch (err) {
        if (__DEV__) {
          console.warn('Unable to load role after login', err instanceof Error ? err.message : String(err));
        }
      }
    }
    if (r) {
      await AsyncStorage.setItem(ROLE_KEY, r);
      setRole(r);
    } else {
      await AsyncStorage.removeItem(ROLE_KEY);
      setRole(null);
    }
    return res;
  }

  async function signup(email: string, password: string, r: string) {
    const res = await signupRequest(email, password, r);
    if (res?.token) {
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    }
    let roleToSet = normalizeRole(res?.role || r);
    if (!roleToSet && res?.token) {
      try {
        const profile = await getProfile(res.token);
        roleToSet = normalizeRole(profile?.role ?? roleToSet);
      } catch (err) {
        if (__DEV__) {
          console.warn('Unable to load role after signup', err instanceof Error ? err.message : String(err));
        }
      }
    }
    if (roleToSet) {
      await AsyncStorage.setItem(ROLE_KEY, roleToSet);
      setRole(roleToSet);
    } else {
      await AsyncStorage.removeItem(ROLE_KEY);
      setRole(null);
    }
    return res;
  }

  async function logout() {
    try {
      await logoutRequest(token ?? undefined);
    } catch (err) {
      if (__DEV__) {
        console.warn('Logout request failed', err instanceof Error ? err.message : String(err));
      }
    } finally {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(ROLE_KEY);
      setToken(null);
      setRole(null);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!token || role) return;

    let cancelled = false;

    const clearAuthState = async () => {
      await AsyncStorage.multiRemove([TOKEN_KEY, ROLE_KEY]);
      if (!cancelled) {
        setToken(null);
        setRole(null);
      }
    };

    setResolvingRole(true);
    (async () => {
      try {
        const profile = await getProfile(token);
        if (cancelled) return;

        const resolvedRole = normalizeRole(profile?.role ?? null);
        if (resolvedRole) {
          await AsyncStorage.setItem(ROLE_KEY, resolvedRole);
          if (!cancelled) {
            setRole(resolvedRole);
          }
        } else if (!cancelled) {
          await clearAuthState();
        }
      } catch (err) {
        if (!cancelled) {
          if (__DEV__) {
            console.warn('Failed to hydrate role from API', err instanceof Error ? err.message : String(err));
          }
          await clearAuthState();
        }
      } finally {
        setResolvingRole(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, token, role]);

  const value = {
    token,
    role,
    loading: loading || resolvingRole,
    hydrated,
    login,
    signup,
    logout,
  } satisfies AuthContextValue;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
