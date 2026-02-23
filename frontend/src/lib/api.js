import axios from 'axios';

// Use window.location.origin for same-origin requests (HTTPS)
const getBackendUrl = () => {
  // In production, use same origin (which will be HTTPS)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.REACT_APP_BACKEND_URL || '';
};

const BACKEND_URL = getBackendUrl();
const API_BASE = `${BACKEND_URL}/api`;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  // Force HTTPS in production
  if (config.url && config.baseURL) {
    const fullUrl = config.baseURL + config.url;
    if (window.location.protocol === 'https:' && fullUrl.includes('http://')) {
      config.baseURL = config.baseURL.replace('http://', 'https://');
    }
  }
  
  const token = localStorage.getItem('bookvia-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('bookvia-token');
      localStorage.removeItem('bookvia-user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  businessRegister: (data) => api.post('/auth/business/register', data),
  businessLogin: (data) => api.post('/auth/business/login', data),
  adminLogin: (data) => api.post('/auth/admin/login', data),
  getMe: () => api.get('/auth/me'),
  sendPhoneCode: (phone) => api.post('/auth/phone/send-code', { phone }),
  verifyPhone: (phone, code) => api.post('/auth/phone/verify', { phone, code }),
  setup2FA: (password, tempToken = null) => {
    const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
    return api.post('/auth/admin/setup-2fa', { password }, config);
  },
  verify2FA: (code, tempToken = null) => {
    const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
    return api.post('/auth/admin/verify-2fa', { code }, config);
  },
};

// Users API
export const usersAPI = {
  updateProfile: (data) => api.put('/users/me', data),
  addFavorite: (businessId) => api.post(`/users/favorites/${businessId}`),
  removeFavorite: (businessId) => api.delete(`/users/favorites/${businessId}`),
  getFavorites: () => api.get('/users/favorites'),
};

// Categories API
export const categoriesAPI = {
  getAll: () => api.get('/categories'),
  getBySlug: (slug) => api.get(`/categories/${slug}`),
  create: (data) => api.post('/categories', data),
};

// Businesses API
export const businessesAPI = {
  search: (params) => api.get('/businesses', { params }),
  getFeatured: (limit = 8) => api.get('/businesses/featured', { params: { limit } }),
  getBySlug: (slug) => api.get(`/businesses/slug/${slug}`),
  getById: (id) => api.get(`/businesses/${id}`),
  updateMe: (data) => api.put('/businesses/me', data),
  getDashboard: () => api.get('/businesses/me/dashboard'),
  getWorkers: (businessId) => api.get(`/businesses/${businessId}/workers`),
  createWorker: (data) => api.post('/businesses/workers', data),
  updateWorkerSchedule: (workerId, schedules) => api.put(`/businesses/workers/${workerId}/schedule`, schedules),
};

// Services API
export const servicesAPI = {
  getByBusiness: (businessId) => api.get(`/services/business/${businessId}`),
  create: (data) => api.post('/services', data),
  update: (id, data) => api.put(`/services/${id}`, data),
  delete: (id) => api.delete(`/services/${id}`),
};

// Bookings API
export const bookingsAPI = {
  getAvailability: (businessId, date, serviceId) => 
    api.get(`/bookings/availability/${businessId}`, { params: { date, service_id: serviceId } }),
  create: (data) => api.post('/bookings', data),
  getMy: (params) => api.get('/bookings/my', { params }),
  getBusiness: (params) => api.get('/bookings/business', { params }),
  cancel: (id) => api.put(`/bookings/${id}/cancel`),
  reschedule: (id, newDate, newTime) => 
    api.put(`/bookings/${id}/reschedule`, null, { params: { new_date: newDate, new_time: newTime } }),
  confirm: (id) => api.put(`/bookings/${id}/confirm`),
  complete: (id) => api.put(`/bookings/${id}/complete`),
  markNoShow: (id) => api.put(`/bookings/${id}/no-show`),
};

// Reviews API
export const reviewsAPI = {
  create: (data) => api.post('/reviews', data),
  getByBusiness: (businessId, params) => api.get(`/reviews/business/${businessId}`, { params }),
};

// Payments API
export const paymentsAPI = {
  createCheckoutSession: (data) => api.post('/payments/checkout/session', data),
  getCheckoutStatus: (sessionId) => api.get(`/payments/checkout/status/${sessionId}`),
};

// Notifications API
export const notificationsAPI = {
  getAll: (unreadOnly = false) => api.get('/notifications', { params: { unread_only: unreadOnly } }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

// Admin API
export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getPendingBusinesses: () => api.get('/admin/businesses/pending'),
  approveBusiness: (id) => api.put(`/admin/businesses/${id}/approve`),
  rejectBusiness: (id, reason) => api.put(`/admin/businesses/${id}/reject`, null, { params: { reason } }),
  suspendBusiness: (id, reason) => api.put(`/admin/businesses/${id}/suspend`, null, { params: { reason } }),
  suspendUser: (id, days, reason) => api.put(`/admin/users/${id}/suspend`, null, { params: { days, reason } }),
  deleteReview: (id, reason) => api.delete(`/admin/reviews/${id}`, { params: { reason } }),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  toggleFeatured: (id, featured) => api.put(`/admin/businesses/${id}/feature`, null, { params: { featured } }),
  // Payment management
  holdPayment: (id, reason) => api.put(`/admin/payments/${id}/hold`, null, { params: { reason } }),
  releasePayment: (id) => api.put(`/admin/payments/${id}/release`),
  getHeldPayments: (params) => api.get('/admin/payments/held', { params }),
};

// Utility API
export const utilityAPI = {
  getCities: () => api.get('/cities'),
  seed: () => api.post('/seed'),
};

export default api;
