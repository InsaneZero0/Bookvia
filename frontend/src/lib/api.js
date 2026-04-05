import axios from 'axios';

// Backend URL configuration
// In production (Vercel), use REACT_APP_BACKEND_URL to point to Railway backend
// In development or Emergent preview, use same origin
const getBackendUrl = () => {
  // Always prefer REACT_APP_BACKEND_URL if set
  if (process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL;
  }
  // Fallback to same origin (works in Emergent preview)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
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
      // Don't redirect for login/auth endpoints - they handle their own 401 errors
      const requestUrl = error.config?.url || '';
      const isAuthEndpoint = requestUrl.includes('/auth/login') || 
                            requestUrl.includes('/auth/admin/login') ||
                            requestUrl.includes('/auth/business/login') ||
                            requestUrl.includes('/auth/business/manager-login');
      
      if (!isAuthEndpoint) {
        localStorage.removeItem('bookvia-token');
        localStorage.removeItem('bookvia-user');
        window.location.href = '/login';
      }
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
  managerLogin: (data) => api.post('/auth/business/manager-login', data),
  getBusinessManagers: (email) => api.get(`/auth/business/managers?email=${encodeURIComponent(email)}`),
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
  getFeatured: (limit = 8, country_code) => api.get('/businesses/featured', { params: { limit, ...(country_code ? { country_code } : {}) } }),
  getBySlug: (slug) => api.get(`/businesses/slug/${slug}`),
  getById: (id) => api.get(`/businesses/${id}`),
  updateMe: (data) => api.put('/businesses/me', data),
  getDashboard: () => api.get('/businesses/me/dashboard'),
  // Workers (for specific business - public)
  getWorkers: (businessId, includeInactive = false, serviceId = null) => 
    api.get(`/businesses/${businessId}/workers`, { params: { include_inactive: includeInactive, ...(serviceId ? { service_id: serviceId } : {}) } }),
  // Workers (for authenticated business)
  getMyWorkers: (includeInactive = false) => 
    api.get('/businesses/my/workers', { params: { include_inactive: includeInactive } }),
  getWorker: (workerId) => api.get(`/businesses/my/workers/${workerId}`),
  createWorker: (data) => api.post('/businesses/my/workers', data),
  updateWorker: (workerId, data) => api.put(`/businesses/my/workers/${workerId}`, data),
  deleteWorker: (workerId) => api.delete(`/businesses/my/workers/${workerId}`),
  uploadWorkerPhoto: (workerId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/businesses/my/workers/${workerId}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  reactivateWorker: (workerId) => api.put(`/businesses/my/workers/${workerId}/reactivate`),
  updateWorkerServices: (workerId, serviceIds) => api.put(`/businesses/my/workers/${workerId}/services`, { service_ids: serviceIds }),
  updateWorkerSchedule: (workerId, schedule) => 
    api.put(`/businesses/my/workers/${workerId}/schedule`, { schedule }),
  addWorkerException: (workerId, exception) => 
    api.post(`/businesses/my/workers/${workerId}/exceptions`, { exception }),
  removeWorkerException: (workerId, exceptionId) => 
    api.delete(`/businesses/my/workers/${workerId}/exceptions/${exceptionId}`),
  // Photos
  uploadPhoto: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/businesses/me/photos', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deletePhoto: (photoId) => api.delete(`/businesses/me/photos/${photoId}`),
  getMyPhotos: () => api.get('/businesses/me/photos'),
  uploadLogo: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/businesses/me/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  // Closures (closed days)
  getMyClosures: () => api.get('/businesses/me/closures'),
  addClosure: (date, reason) => api.post('/businesses/me/closures', { date, reason }),
  removeClosure: (date) => api.delete(`/businesses/me/closures/${date}`),
  // Subscription
  createSubscription: (originUrl) => api.post('/businesses/me/subscribe', { origin_url: originUrl }),
  getSubscriptionStatus: (sessionId) => api.get(`/businesses/me/subscription/status${sessionId ? `?session_id=${sessionId}` : ''}`),
  cancelSubscription: () => api.post('/businesses/me/subscription/cancel'),
  // Blacklist
  getBlacklist: () => api.get('/businesses/me/blacklist'),
  addToBlacklist: (data) => api.post('/businesses/me/blacklist', data),
  removeFromBlacklist: (entryId) => api.delete(`/businesses/me/blacklist/${entryId}`),
  // Owner PIN
  setOwnerPin: (pin) => api.post('/businesses/me/pin', { pin }),
  verifyOwnerPin: (pin) => api.post('/businesses/me/pin/verify', { pin }),
  getPinStatus: () => api.get('/businesses/me/pin/status'),
  // Manager
  designateManager: (workerId, permissions) => api.put(`/businesses/my/workers/${workerId}/manager`, { permissions }),
  removeManager: (workerId) => api.delete(`/businesses/my/workers/${workerId}/manager`),
  updateManagerPermissions: (workerId, permissions) => api.put(`/businesses/my/workers/${workerId}/manager/permissions`, { permissions }),
  setManagerPin: (workerId, pin) => api.post(`/businesses/my/workers/${workerId}/manager/pin`, { pin }),
  getActivityLog: (params = {}) => api.get('/businesses/my/activity-log', { params }),
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
  getAvailability: (businessId, date, serviceId, workerId, includeUnavailable = false) => 
    api.get(`/bookings/availability/${businessId}`, { 
      params: { 
        date, 
        service_id: serviceId,
        worker_id: workerId,
        include_unavailable: includeUnavailable
      } 
    }),
  create: (data) => api.post('/bookings', data),
  getMy: (params) => api.get('/bookings/my', { params }),
  getBusiness: (params) => api.get('/bookings/business', { params }),
  cancelByUser: (id, reason) => api.put(`/bookings/${id}/cancel/user`, { reason }),
  cancelByBusiness: (id, reason) => api.put(`/bookings/${id}/cancel/business`, { reason }),
  reschedule: (id, newDate, newTime) => 
    api.put(`/bookings/${id}/reschedule`, null, { params: { new_date: newDate, new_time: newTime } }),
  rescheduleByBusiness: (id, data) => api.put(`/bookings/${id}/reschedule/business`, data),
  getAvailability: (businessId, date, serviceId, workerId) => 
    api.get(`/bookings/availability/${businessId}`, { params: { date, service_id: serviceId, worker_id: workerId } }),
  confirm: (id) => api.put(`/bookings/${id}/confirm`),
  complete: (id) => api.put(`/bookings/${id}/complete`),
  markNoShow: (id) => api.put(`/bookings/${id}/no-show`),
  getStatsDetail: (statType, dateFrom, dateTo) => api.get('/bookings/business/stats-detail', { 
    params: { stat_type: statType, date_from: dateFrom, date_to: dateTo } 
  }),
};

// Reviews API
export const reviewsAPI = {
  create: (data) => api.post('/reviews/', data),
  getByBusiness: (businessId, params) => api.get(`/reviews/business/${businessId}`, { params }),
};

// Payments API
export const paymentsAPI = {
  // Deposit checkout for bookings
  createDepositCheckout: (bookingId) => api.post('/payments/deposit/checkout', { booking_id: bookingId }),
  getCheckoutStatus: (sessionId) => api.get(`/payments/checkout/status/${sessionId}`),
  getTransaction: (transactionId) => api.get(`/payments/transaction/${transactionId}`),
  getMyTransactions: (params) => api.get('/payments/my-transactions', { params }),
  getBusinessTransactions: (params) => api.get('/payments/business-transactions', { params }),
  // Legacy checkout for subscriptions
  createCheckoutSession: (data) => api.post('/payments/checkout/session', data),
};

// Business Finance API
export const financeAPI = {
  getSummary: () => api.get('/business/finance/summary'),
  getTransactions: (params) => api.get('/business/finance/transactions', { params }),
  getLedger: (params) => api.get('/business/finance/ledger', { params }),
  getSettlements: (params) => api.get('/business/finance/settlements', { params }),
};

// Notifications API
export const notificationsAPI = {
  getAll: (unreadOnly = false) => api.get('/notifications', { params: { unread_only: unreadOnly } }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
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
  getSentEmails: (params) => api.get('/admin/emails', { params }),
  // Payment management
  holdPayment: (id, reason) => api.put(`/admin/payments/${id}/hold`, null, { params: { reason } }),
  releasePayment: (id) => api.put(`/admin/payments/${id}/release`),
  getHeldPayments: (params) => api.get('/admin/payments/held', { params }),
  // Settlements
  getSettlements: (params) => api.get('/admin/settlements', { params }),
  generateSettlements: (year, month) => api.post(`/admin/settlements/generate?year=${year}&month=${month}`),
  markSettlementPaid: (id, payout_reference) => api.put(`/admin/settlements/${id}/pay`, { payout_reference }),
  togglePayoutHold: (businessId, hold, reason) => api.put(`/admin/businesses/${businessId}/payout-hold`, { hold, reason }),
  // Export
  exportTransactions: (year, month) => api.get(`/admin/export/transactions?year=${year}&month=${month}`, { responseType: 'blob' }),
  exportSettlements: (year, month) => api.get(`/admin/export/settlements?year=${year}&month=${month}`, { responseType: 'blob' }),
};

// Utility API
export const utilityAPI = {
  getCities: (countryCode = 'MX') => api.get('/cities', { params: { country_code: countryCode } }),
  seed: () => api.post('/seed'),
  seedCountries: () => api.post('/seed/countries'),
};

// SEO API
export const seoAPI = {
  getCountries: () => api.get('/seo/countries'),
  getCities: (countryCode) => api.get(`/seo/cities/${countryCode}`),
  getCategories: () => api.get('/seo/categories'),
  getMeta: (pageType, slug, country = 'mx', city = null) => 
    api.get(`/seo/meta/${pageType}/${slug}`, { params: { country, city } }),
  getBusinesses: (country, city, category = null, page = 1) => 
    api.get(`/seo/businesses/${country}/${city}`, { params: { category, page } }),
  getBusiness: (country, city, slug) => 
    api.get(`/seo/business/${country}/${city}/${slug}`),
};

export default api;
