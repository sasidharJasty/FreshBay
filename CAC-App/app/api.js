export async function getDonorProfile(token) {
  return request('/api/donors/profile/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function updateDonorProfile(token, payload) {
  return request('/api/donors/profile/', {
    method: 'PATCH',
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify(payload),
  });
}
// Minimal API helpers for auth. For Expo on device/emulator, localhost usually points to the device
// so we try to infer the host from Expo Constants (packager host). You can still override with
// process.env.API_BASE_URL if needed.
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

function inferHost() {
  const expoConfig = Constants.expoConfig || Constants.manifest || null;
  const expoExtra =
    Constants.manifest2?.extra?.expoGo || Constants.expoConfig?.extra?.expoGo || expoConfig?.extra?.expoGo || null;
  const debuggerHost =
    expoExtra?.debuggerHost ||
    expoConfig?.hostUri ||
    expoConfig?.debuggerHost ||
    expoExtra?.packagerHost ||
    null;

  if (typeof debuggerHost === 'string') {
    return debuggerHost.split(':')[0];
  }

  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (typeof scriptURL === 'string') {
    const match = scriptURL.match(/https?:\/\/(.*?):\d+/);
    if (match && match[1]) {
      return match[1];
    }
  }

  if (Platform.OS === 'android') return '10.0.2.2';
  return '127.0.0.1';
}

const INFERRED_HOST = inferHost();
const DEFAULT_PORT = 8000;
const ENV_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  (typeof window !== 'undefined' && window.__APP_API_BASE_URL__) ||
  null;
const BASE_URL = ENV_BASE_URL || `http://${INFERRED_HOST}:${DEFAULT_PORT}`;
console.log('API BASE_URL ->', BASE_URL);

async function request(path, options = {}) {
  const { headers: customHeaders = {}, body, ...rest } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const headers = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...customHeaders,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_parseError) {
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

export async function logout(token) {
  const headers = token ? { Authorization: `Token ${token}` } : undefined;
  return request('/api/logout/', {
    method: 'POST',
    headers,
  });
}

export async function getProfile(token) {
  return request('/api/me/', { method: 'GET', headers: { Authorization: `Token ${token}` } });
}

export async function getFamiliesDashboard(token) {
  return request('/api/families/dashboard/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function getFamiliesAvailable(token, category = 'all') {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  return request(`/api/families/available/${query}`, {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function getFamiliesClaims(token) {
  return request('/api/families/claims/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function getFamiliesAid(token) {
  return request('/api/families/aid/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function searchAgritourism(token, queryString) {
  const headers = token ? { Authorization: `Token ${token}` } : undefined;
  const path = queryString
    ? `/api/families/agritourism/search/?${queryString}`
    : '/api/families/agritourism/search/';
  return request(path, {
    method: 'GET',
    headers,
  });
}

export async function getFamiliesProfile(token) {
  return request('/api/families/profile/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function reserveDonation(token, donationId) {
  return request('/api/families/reserve/', {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify({ donation_id: donationId }),
  });
}

export async function getDonorDashboard(token) {
  return request('/api/donors/dashboard/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function getDonorDonations(token) {
  return request('/api/donors/donations/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function createDonorDonation(token, payload) {
  return request('/api/donors/donations/', {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function updateDonorDonation(token, donationId, payload) {
  return request(`/api/donors/donations/${donationId}/`, {
    method: 'PATCH',
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function getDonorDonationClaims(token, donationId) {
  return request(`/api/donors/donations/${donationId}/claims/`, {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function updateDonorClaim(token, claimId, payload) {
  return request(`/api/donors/claims/${claimId}/`, {
    method: 'PATCH',
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function getDonorAnalytics(token) {
  return request('/api/donors/analytics/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function getDonorImpact(token) {
  return request('/api/donors/impact/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function getDonorAutoRoute(token, donationId) {
  return request('/api/donors/auto-route/', {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify({ donation_id: donationId }),
  });
}

export async function getVolunteerRoutes(token) {
  return request('/api/volunteers/routes/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function getVolunteerAvailableTasks(token, filters = {}) {
  const parts = [];
  if (typeof filters.maxDistance === 'number') {
    parts.push(`max_distance=${encodeURIComponent(filters.maxDistance)}`);
  }
  if (filters.urgency) {
    parts.push(`urgency=${encodeURIComponent(filters.urgency)}`);
  }
  if (filters.load) {
    parts.push(`load=${encodeURIComponent(filters.load)}`);
  }
  const query = parts.join('&');
  const path = query ? `/api/volunteers/tasks/?${query}` : '/api/volunteers/tasks/';
  return request(path, {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function acceptVolunteerTask(token, taskId) {
  return request('/api/volunteers/tasks/accept/', {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify({ task_id: taskId }),
  });
}

export async function updateVolunteerTaskStatus(token, payload) {
  return request('/api/volunteers/tasks/status/', {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function getVolunteerActiveDeliveries(token) {
  return request('/api/volunteers/active/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function getVolunteerImpact(token) {
  return request('/api/volunteers/impact/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function getVolunteerProfile(token) {
  return request('/api/volunteers/profile/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function updateVolunteerProfile(token, payload) {
  return request('/api/volunteers/profile/', {
    method: 'PATCH',
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function getFoodInspections(token) {
  return request('/api/food-inspections/', {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
  });
}

export async function uploadFoodInspection(token, asset) {
  if (!asset?.uri) {
    throw new Error('Selectable image asset must include a URI.');
  }

  const formData = new FormData();
  const fileName = asset.fileName || asset.name || asset.uri.split('/').pop() || 'inspection.jpg';
  const extension = fileName.split('.').pop()?.toLowerCase();
  const inferredType =
    asset.mimeType ||
    (extension === 'png'
      ? 'image/png'
      : extension === 'heic'
      ? 'image/heic'
      : extension === 'webp'
      ? 'image/webp'
      : 'image/jpeg');

  formData.append('image', {
    uri: asset.uri,
    name: fileName,
    type: inferredType,
  });

  return request('/api/food-inspections/', {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: formData,
  });
}

export async function deleteFoodInspection(token, inspectionId) {
  return request(`/api/food-inspections/${inspectionId}/`, {
    method: 'DELETE',
    headers: { Authorization: `Token ${token}` },
  });
}

export default {
  login,
  signup,
  logout,
  getProfile,
  getFamiliesDashboard,
  getFamiliesAvailable,
  getFamiliesClaims,
  getFamiliesAid,
  searchAgritourism,
  getFamiliesProfile,
  reserveDonation,
  getDonorDashboard,
  getDonorDonations,
  createDonorDonation,
  updateDonorDonation,
  getDonorDonationClaims,
  updateDonorClaim,
  getDonorAnalytics,
  getDonorImpact,
  getDonorAutoRoute,
  getVolunteerRoutes,
  getVolunteerAvailableTasks,
  acceptVolunteerTask,
  updateVolunteerTaskStatus,
  getVolunteerActiveDeliveries,
  getVolunteerImpact,
  getVolunteerProfile,
  updateVolunteerProfile,
  getFoodInspections,
  uploadFoodInspection,
  deleteFoodInspection,
};
