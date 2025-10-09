// Minimal API helpers for auth. For Expo on device/emulator, localhost usually points to the device
// so we try to infer the host from Expo Constants (packager host). You can still override with
// process.env.API_BASE_URL if needed.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function inferHost() {
  // manifest.debuggerHost is like '10.0.0.126:8081'
  const manifest = Constants.manifest || Constants.expoConfig || Constants.manifest2;
  const debuggerHost = manifest && (manifest.debuggerHost || manifest.hostUri || manifest.packagerOpts?.packagerPort);
  if (typeof debuggerHost === 'string') {
    return debuggerHost.split(':')[0];
  }
  // Android emulator uses 10.0.2.2 to reach host machine
  if (Platform.OS === 'android') return '10.0.2.2';
  // default to localhost for iOS simulator and web
  return '127.0.0.1';
}

const INFERRED_HOST = inferHost();
const DEFAULT_PORT = 8000;
const BASE_URL = process.env.API_BASE_URL || `http://${INFERRED_HOST}:${DEFAULT_PORT}`;
console.log('API BASE_URL ->', BASE_URL);

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    // not JSON
  }
  if (!res.ok) {
    const err = new Error(json?.detail || `Request failed: ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function login(email, password) {
  return request('/api/login/', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function signup(email, password, role = 'donor') {
  return request('/api/signup/', { method: 'POST', body: JSON.stringify({ email, password, role }) });
}

export async function getProfile(token) {
  return request('/api/me/', { method: 'GET', headers: { Authorization: `Token ${token}` } });
}

export async function getAvailable(lat, lng, radius = 10) {
  // try real endpoint, fallback to mock
  try {
    return await request(`/api/available?lat=${lat || ''}&lng=${lng || ''}&radius=${radius}`);
  } catch (e) {
    return [
      { id: '1', title: 'Bread & Pastries', distance: '0.6 mi', freshness: 'High' },
      { id: '2', title: 'Milk (2L)', distance: '1.2 mi', freshness: 'Medium' },
    ];
  }
}

export async function claim(itemId) {
  try {
    return await request(`/api/claim/`, { method: 'POST', body: JSON.stringify({ item_id: itemId }) });
  } catch (e) {
    // fallback mock
    return { success: true, id: itemId };
  }
}

export default { login, signup, getProfile, getAvailable, claim };
