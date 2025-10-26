import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as loginRequest, signup as signupRequest } from '@/app/api';

const TOKEN_KEY = 'auth_token_v1';
const ROLE_KEY = 'user_role_v1';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tk = await AsyncStorage.getItem(TOKEN_KEY);
        const r = await AsyncStorage.getItem(ROLE_KEY);
        if (!mounted) return;
        if (tk) setToken(tk);
        if (r) setRole(r);
  } catch (_error) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function login(email, password) {
  const res = await loginRequest(email, password);
    if (res?.token) {
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    }
    const r = res?.role || null;
    if (r) {
      await AsyncStorage.setItem(ROLE_KEY, r);
      setRole(r);
    }
    return res;
  }

  async function signup(email, password, r) {
  const res = await signupRequest(email, password, r);
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
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
