import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '@/app/api';

const TOKEN_KEY = 'auth_token_v1';
const ROLE_KEY = 'user_role_v1';

const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tk = await AsyncStorage.getItem(TOKEN_KEY);
        const r = await AsyncStorage.getItem(ROLE_KEY);
        if (!mounted) return;
        if (tk) setToken(tk);
        if (r) setRole(r);
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    if (res?.token) {
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    }
    // backend may return role
    const r = res?.role || null;
    if (r) {
      await AsyncStorage.setItem(ROLE_KEY, r);
      setRole(r);
    }
    return res;
  }

  async function signup(email: string, password: string, r: string) {
    const res = await api.signup(email, password, r);
    if (res?.token) {
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    }
    const roleToSet = res?.role || r;
    if (roleToSet) {
      await AsyncStorage.setItem(ROLE_KEY, roleToSet);
      setRole(roleToSet);
    }
    return res;
  }

  async function logout() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(ROLE_KEY);
    setToken(null);
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{ token, role, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext as any);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
