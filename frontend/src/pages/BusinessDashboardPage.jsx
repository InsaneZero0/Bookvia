import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { businessesAPI, bookingsAPI, servicesAPI, notificationsAPI } from '@/lib/api';
import { formatDate, formatTime, formatCurrency, getStatusColor, getInitials } from '@/lib/utils';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon, DollarSign, Star, Users, Clock, CheckCircle2,
  XCircle, AlertTriangle, TrendingUp, Settings, UserCog, Image, Upload,
  Trash2, Eye, Plus, Pencil, BarChart3, Briefcase, ArrowUpRight,
  Ban, CalendarOff, CreditCard, Shield, RefreshCw, Mail, Phone, History,
  ChevronLeft, ChevronRight, Filter, Bell
} from 'lucide-react';

export default function BusinessDashboardPage() {
  const { t, language } = useI18n();
  const { business, user, isAuthenticated, isBusiness, isManager, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardError, setDashboardError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dayBookings, setDayBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [closures, setClosures] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const [statsModal, setStatsModal] = useState({ open: false, type: null, title: '', bookings: [], loading: false, totalRevenue: null });
  const [statsDateFrom, setStatsDateFrom] = useState('');
  const [statsDateTo, setStatsDateTo] = useState('');
  const [rescheduleModal, setRescheduleModal] = useState({ open: false, booking: null });
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingDetail, setBookingDetail] = useState(null);
  const [managerModal, setManagerModal] = useState({ open: false, worker: null });
  const [managerPermissions, setManagerPermissions] = useState({});
  const [pinModal, setPinModal] = useState({ open: false, type: null }); // type: 'owner_setup' | 'manager_pin'
  const [pinValue, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [ownerHasPin, setOwnerHasPin] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPages, setActivityPages] = useState(1);
  const [activityFilter, setActivityFilter] = useState('all');
  const [activityLoading, setActivityLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  useEffect(() => {
    if (!isAuthenticated || !isBusiness) {
      navigate('/business/login');
      return;
    }
    loadDashboard();
    loadNotifications();
    const notifInterval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(notifInterval);
  }, [isAuthenticated, isBusiness]);

  const loadNotifications = async () => {
    try {
      const [res, countRes] = await Promise.all([
        notificationsAPI.getAll(),
        notificationsAPI.getUnreadCount()
      ]);
      setNotifications(Array.isArray(res.data) ? res.data : []);
      setUnreadCount(countRes.data?.count || 0);
    } catch { }
  };

  const loadUnreadCount = async () => {
    try {
      const res = await notificationsAPI.getUnreadCount();
      setUnreadCount(res.data?.count || 0);
    } catch { }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { }
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { }
  };

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e) => {
      if (!e.target.closest('[data-testid="notification-bell"]') && !e.target.closest('[data-testid="notification-panel"]')) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  useEffect(() => {
    if (isManager && activeTab === 'overview' && !hasPermission('view_agenda')) {
      const fallbackTabs = ['services', 'team', 'photos'];
      const fallbackPerms = { services: 'edit_services', team: 'view_team', photos: 'edit_photos' };
      const first = fallbackTabs.find(t => hasPermission(fallbackPerms[t]));
      if (first) setActiveTab(first);
    }
  }, [isManager]);

  useEffect(() => {
    if (dashboardData?.business?.id) {
      loadDayBookings();
    }
  }, [selectedDate, dashboardData]);

  useEffect(() => {
    if (activeTab === 'activity' && !isManager) {
      loadActivityLogs(1, activityFilter);
    }
  }, [activeTab]);

  const loadDashboard = async () => {
    try {
      setDashboardError(null);
      const [dashRes, servicesRes, workersRes, photosRes, closuresRes] = await Promise.all([
        businessesAPI.getDashboard(),
        servicesAPI.getByBusiness(business?.id || user?.business_id || ''),
        businessesAPI.getMyWorkers().catch(() => ({ data: [] })),
        businessesAPI.getMyPhotos().catch(() => ({ data: [] })),
        businessesAPI.getMyClosures().catch(() => ({ data: [] })),
      ]);
      setDashboardData(dashRes.data);
      setServices(Array.isArray(servicesRes.data) ? servicesRes.data : []);
      setWorkers(Array.isArray(workersRes.data) ? workersRes.data : []);
      setPhotos(Array.isArray(photosRes.data) ? photosRes.data : []);
      setClosures(Array.isArray(closuresRes.data) ? closuresRes.data : []);
      // Load subscription info
      try {
        const subRes = await businessesAPI.getSubscriptionStatus();
        setSubscriptionData(subRes.data);
      } catch { setSubscriptionData(null); }
      // Load pin status
      try {
        const pinRes = await businessesAPI.getPinStatus();
        setOwnerHasPin(pinRes.data?.has_pin || false);
      } catch { setOwnerHasPin(false); }
    } catch (error) {
      console.error('Error loading dashboard:', error);
      const detail = error?.response?.data?.detail || error?.message || 'Error desconocido';
      setDashboardError(detail);
      toast.error(language === 'es' ? `Error al cargar el panel: ${detail}` : `Dashboard error: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  const loadDayBookings = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await bookingsAPI.getBusiness({ date: dateStr });
      setDayBookings(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error loading bookings:', error);
      setDayBookings([]);
    }
  };

  const loadActivityLogs = async (page = 1, filter = 'all') => {
    setActivityLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filter === 'admin') params.actor_type = 'admin';
      if (filter === 'owner') params.actor_type = 'owner';
      const res = await businessesAPI.getActivityLog(params);
      setActivityLogs(res.data?.logs || []);
      setActivityTotal(res.data?.total || 0);
      setActivityPages(res.data?.pages || 1);
      setActivityPage(page);
    } catch (error) {
      console.error('Error loading activity logs:', error);
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const handleBookingAction = async (bookingId, action) => {
    try {
      switch (action) {
        case 'confirm': await bookingsAPI.confirm(bookingId); break;
        case 'complete': await bookingsAPI.complete(bookingId); break;
        case 'no-show': await bookingsAPI.markNoShow(bookingId); break;
        case 'cancel': await bookingsAPI.cancelByBusiness(bookingId, 'Cancelada por el negocio'); break;
        default: break;
      }
      toast.success(language === 'es' ? 'Actualizado' : 'Updated');
      loadDayBookings();
      loadDashboard();
    } catch (error) {
      const detail = error?.response?.data?.detail || '';
      toast.error(language === 'es' ? `Error al actualizar: ${detail}` : `Error updating: ${detail}`);
    }
  };

  const openReschedule = (booking) => {
    setRescheduleModal({ open: true, booking });
    setRescheduleDate(null);
    setRescheduleSlots([]);
    setRescheduleTime('');
  };

  const loadRescheduleSlots = async (date) => {
    const bk = rescheduleModal.booking;
    if (!bk || !date) return;
    setSlotsLoading(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const res = await bookingsAPI.getAvailability(bk.business_id, dateStr, bk.service_id, bk.worker_id);
      const available = (res.data.slots || []).filter(s => s.status === 'available');
      setRescheduleSlots(available);
    } catch {
      setRescheduleSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleReschedule = async () => {
    const bk = rescheduleModal.booking;
    if (!bk || !rescheduleDate || !rescheduleTime) return;
    setRescheduleLoading(true);
    try {
      const dateStr = format(rescheduleDate, 'yyyy-MM-dd');
      await bookingsAPI.rescheduleByBusiness(bk.id, { new_date: dateStr, new_time: rescheduleTime });
      toast.success(language === 'es' ? 'Cita reagendada exitosamente' : 'Appointment rescheduled');
      setRescheduleModal({ open: false, booking: null });
      loadDayBookings();
      loadDashboard();
    } catch (error) {
      const detail = error?.response?.data?.detail || '';
      toast.error(language === 'es' ? `Error al reagendar: ${detail}` : `Reschedule error: ${detail}`);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const openStatsModal = async (type, title, dateFrom, dateTo) => {
    setStatsModal({ open: true, type, title, bookings: [], loading: true, totalRevenue: null });
    try {
      const res = await bookingsAPI.getStatsDetail(type, dateFrom || undefined, dateTo || undefined);
      setStatsModal(prev => ({ 
        ...prev, 
        bookings: res.data.bookings || [], 
        loading: false,
        totalRevenue: res.data.total_revenue 
      }));
    } catch {
      setStatsModal(prev => ({ ...prev, bookings: [], loading: false }));
      toast.error(language === 'es' ? 'Error al cargar datos' : 'Error loading data');
    }
  };

  const closeStatsModal = () => {
    setStatsModal(prev => ({ ...prev, open: false }));
    // Refresh dashboard stats
    loadDashboard();
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    let successCount = 0;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name}: ${language === 'es' ? 'Máximo 5MB' : 'Max 5MB'}`);
        continue;
      }
      try {
        await businessesAPI.uploadPhoto(file);
        successCount++;
      } catch {
        toast.error(`${file.name}: ${language === 'es' ? 'Error al subir' : 'Upload failed'}`);
      }
    }
    if (successCount > 0) {
      toast.success(language === 'es' ? `${successCount} foto(s) subida(s)` : `${successCount} photo(s) uploaded`);
      const photosRes = await businessesAPI.getMyPhotos().catch(() => ({ data: [] }));
      setPhotos(Array.isArray(photosRes.data) ? photosRes.data : []);
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm(language === 'es' ? '¿Eliminar esta foto?' : 'Delete this photo?')) return;
    try {
      await businessesAPI.deletePhoto(photoId);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
      toast.success(language === 'es' ? 'Foto eliminada' : 'Photo deleted');
    } catch {
      toast.error(language === 'es' ? 'Error' : 'Error');
    }
  };

  // Closure handlers
  const closedDates = closures.map(c => c.date);

  const handleCancelSubscription = async () => {
    if (!window.confirm(language === 'es'
      ? '¿Estás seguro de cancelar tu suscripción? Tu negocio dejará de ser visible al final del periodo actual.'
      : 'Are you sure you want to cancel? Your business will stop being visible at the end of the current period.'
    )) return;
    setCancelingSubscription(true);
    try {
      await businessesAPI.cancelSubscription();
      toast.success(language === 'es' ? 'Suscripción cancelada. Se mantendrá activa hasta el final del periodo.' : 'Subscription canceled. It will remain active until the end of the period.');
      const subRes = await businessesAPI.getSubscriptionStatus();
      setSubscriptionData(subRes.data);
    } catch {
      toast.error(language === 'es' ? 'Error al cancelar' : 'Error canceling');
    } finally {
      setCancelingSubscription(false);
    }
  };

  // ── Manager & PIN Functions ──
  const PERMISSION_LABELS = {
    complete_bookings: { es: 'Completar/confirmar citas', en: 'Complete/confirm bookings' },
    reschedule_bookings: { es: 'Reagendar citas', en: 'Reschedule bookings' },
    cancel_bookings: { es: 'Cancelar citas', en: 'Cancel bookings' },
    block_clients: { es: 'Bloquear clientes', en: 'Block clients' },
    view_client_data: { es: 'Ver datos de contacto del cliente', en: 'View client contact data' },
    edit_services: { es: 'Editar servicios y precios', en: 'Edit services & prices' },
    view_reports: { es: 'Ver ingresos y reportes', en: 'View income & reports' },
    view_today_bookings: { es: 'Ver citas de hoy', en: "View today's bookings" },
    view_confirmed_bookings: { es: 'Ver citas confirmadas', en: 'View confirmed bookings' },
    view_agenda: { es: 'Ver agenda', en: 'View schedule' },
    view_team: { es: 'Ver equipo', en: 'View team' },
    edit_photos: { es: 'Editar fotos del negocio', en: 'Edit business photos' },
    edit_description: { es: 'Editar descripcion del negocio', en: 'Edit business description' },
    edit_schedule: { es: 'Editar horarios de atencion', en: 'Edit business hours' },
    edit_contact: { es: 'Editar contacto y direccion', en: 'Edit contact & address' },
  };

  const PERMISSION_GROUPS = {
    es: {
      'Secciones visibles': ['view_today_bookings', 'view_confirmed_bookings', 'view_agenda', 'view_team'],
      'Acciones en citas': ['complete_bookings', 'reschedule_bookings', 'cancel_bookings'],
      'Clientes': ['block_clients', 'view_client_data'],
      'Perfil del negocio': ['edit_photos', 'edit_description', 'edit_schedule', 'edit_contact'],
      'Negocio': ['edit_services', 'view_reports'],
    },
    en: {
      'Visible sections': ['view_today_bookings', 'view_confirmed_bookings', 'view_agenda', 'view_team'],
      'Booking actions': ['complete_bookings', 'reschedule_bookings', 'cancel_bookings'],
      'Clients': ['block_clients', 'view_client_data'],
      'Business profile': ['edit_photos', 'edit_description', 'edit_schedule', 'edit_contact'],
      'Business': ['edit_services', 'view_reports'],
    },
  };

  const openManagerModal = (worker) => {
    setManagerPermissions(worker.manager_permissions || {
      complete_bookings: true, reschedule_bookings: true, cancel_bookings: false,
      block_clients: false, view_client_data: false, edit_services: false, view_reports: false,
      view_today_bookings: true, view_confirmed_bookings: true, view_agenda: true, view_team: false,
      edit_photos: false, edit_description: false, edit_schedule: false, edit_contact: false,
    });
    setManagerModal({ open: true, worker });
  };

  const handleDesignateManager = async () => {
    try {
      await businessesAPI.designateManager(managerModal.worker.id, managerPermissions);
      toast.success(language === 'es' ? `${managerModal.worker.name} designado como administrador` : `${managerModal.worker.name} designated as administrator`);
      setManagerModal({ open: false, worker: null });
      loadDashboard();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error');
    }
  };

  const handleUpdatePermissions = async () => {
    try {
      await businessesAPI.updateManagerPermissions(managerModal.worker.id, managerPermissions);
      toast.success(language === 'es' ? 'Permisos actualizados' : 'Permissions updated');
      setManagerModal({ open: false, worker: null });
      loadDashboard();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error');
    }
  };

  const handleRemoveManager = async (worker) => {
    if (!window.confirm(language === 'es' ? `¿Quitar a ${worker.name} como administrador?` : `Remove ${worker.name} as administrator?`)) return;
    try {
      await businessesAPI.removeManager(worker.id);
      toast.success(language === 'es' ? 'Rol de administrador removido' : 'Administrator role removed');
      loadDashboard();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error');
    }
  };

  const handleSaveOwnerPin = async () => {
    if (pinValue.length < 4 || pinValue.length > 6 || !/^\d+$/.test(pinValue)) {
      toast.error(language === 'es' ? 'El PIN debe ser de 4-6 dígitos' : 'PIN must be 4-6 digits');
      return;
    }
    if (pinValue !== pinConfirm) {
      toast.error(language === 'es' ? 'Los PINs no coinciden' : 'PINs do not match');
      return;
    }
    try {
      await businessesAPI.setOwnerPin(pinValue);
      toast.success(language === 'es' ? 'PIN de seguridad configurado' : 'Security PIN set');
      setPinModal({ open: false, type: null });
      setPinValue(''); setPinConfirm('');
      setOwnerHasPin(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error');
    }
  };

  const handleSetManagerPin = async () => {
    if (pinValue.length < 4 || pinValue.length > 6 || !/^\d+$/.test(pinValue)) {
      toast.error(language === 'es' ? 'El PIN debe ser de 4-6 dígitos' : 'PIN must be 4-6 digits');
      return;
    }
    if (pinValue !== pinConfirm) {
      toast.error(language === 'es' ? 'Los PINs no coinciden' : 'PINs do not match');
      return;
    }
    try {
      await businessesAPI.setManagerPin(pinModal.workerId, pinValue);
      toast.success(language === 'es' ? 'PIN del administrador configurado' : 'Administrator PIN set');
      setPinModal({ open: false, type: null });
      setPinValue(''); setPinConfirm('');
      loadDashboard();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error');
    }
  };

  const handleToggleClosure = async (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const isClosed = closedDates.includes(dateStr);

    try {
      if (isClosed) {
        await businessesAPI.removeClosure(dateStr);
        setClosures(prev => prev.filter(c => c.date !== dateStr));
        toast.success(language === 'es' ? 'Día reabierto' : 'Day reopened');
      } else {
        const res = await businessesAPI.addClosure(dateStr, null);
        setClosures(prev => [...prev, res.data]);
        toast.success(language === 'es' ? 'Día marcado como cerrado' : 'Day marked as closed');
      }
    } catch {
      toast.error(language === 'es' ? 'Error' : 'Error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const biz = dashboardData?.business;
  const stats = dashboardData?.stats;

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="business-dashboard-page">
      <div className="container-app py-8">

        {/* ── Header ─────────────────────────────────── */}
        {isManager && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800/40" data-testid="manager-session-banner">
            <UserCog className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {language === 'es' ? `Sesión de administrador: ${user?.worker_name || ''}` : `Administrator session: ${user?.worker_name || ''}`}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {language === 'es' ? 'Acceso limitado según tus permisos asignados' : 'Limited access based on your assigned permissions'}
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 border-2 border-background shadow-lg">
              <AvatarImage src={biz?.logo_url || photos[0]?.url} />
              <AvatarFallback className="bg-[#F05D5E] text-white text-xl font-bold">
                {getInitials(biz?.name || '')}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl sm:text-3xl font-heading font-bold">{biz?.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge className={getStatusColor(biz?.status)}>
                  {biz?.status === 'approved' ? (language === 'es' ? 'Aprobado' : 'Approved')
                    : biz?.status === 'pending' ? (language === 'es' ? 'En revisión' : 'Under review')
                    : biz?.status}
                </Badge>
                {biz?.rating > 0 && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    {biz?.rating.toFixed(1)} ({biz?.review_count})
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {/* Notification Bell */}
            <div className="relative">
              <Button variant="outline" size="icon" className="h-9 w-9 relative" onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) loadNotifications(); }} data-testid="notification-bell">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#F05D5E] text-white text-[10px] font-bold flex items-center justify-center" data-testid="unread-count">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </Button>
              {notifOpen && (
                <div className="absolute right-0 top-11 w-80 sm:w-96 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden" data-testid="notification-panel">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                    <h3 className="text-sm font-semibold">{language === 'es' ? 'Notificaciones' : 'Notifications'}</h3>
                    {unreadCount > 0 && (
                      <button className="text-xs text-[#F05D5E] hover:underline" onClick={handleMarkAllRead} data-testid="mark-all-read">
                        {language === 'es' ? 'Marcar todo como leido' : 'Mark all as read'}
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center">
                        <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">{language === 'es' ? 'Sin notificaciones' : 'No notifications'}</p>
                      </div>
                    ) : notifications.map(n => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40 ${!n.read ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''}`}
                        onClick={() => { if (!n.read) handleMarkRead(n.id); }}
                        data-testid={`notif-item-${n.id}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-[#F05D5E] shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!n.read ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {new Date(n.created_at).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={async () => {
              let profileSlug = biz?.slug || biz?.id;
              if (!profileSlug) {
                try {
                  const meRes = await businessesAPI.getDashboard();
                  profileSlug = meRes.data?.business?.slug || meRes.data?.business?.id;
                } catch {}
              }
              if (profileSlug) {
                window.location.href = `/business/${profileSlug}`;
              } else {
                toast.error(language === 'es' ? 'Perfil no disponible. Intenta recargar la pagina.' : 'Profile not available. Try reloading the page.');
              }
            }} data-testid="view-profile-button">
              <Eye className="h-4 w-4 mr-1.5" />{language === 'es' ? 'Ver perfil' : 'View profile'}
            </Button>
            {(hasPermission('edit_description') || hasPermission('edit_schedule') || hasPermission('edit_contact') || hasPermission('edit_photos') || hasPermission('block_clients')) && (
              <Button variant="outline" size="sm" onClick={() => navigate('/business/settings')}>
                <Settings className="h-4 w-4 mr-1.5" />{language === 'es' ? 'Config' : 'Settings'}
              </Button>
            )}
          </div>
        </div>

        {/* Status Alert */}
        {dashboardError && (
          <Card className="mb-6 border-red-500/50 bg-red-50 dark:bg-red-900/20" data-testid="dashboard-error-alert">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-red-800 dark:text-red-200 text-sm">
                  {language === 'es' ? 'Error al cargar el panel' : 'Dashboard loading error'}
                </p>
                <p className="text-xs text-red-700 dark:text-red-300">{dashboardError}</p>
              </div>
              <Button size="sm" variant="outline" onClick={loadDashboard}>
                {language === 'es' ? 'Reintentar' : 'Retry'}
              </Button>
            </CardContent>
          </Card>
        )}
        {biz?.status === 'pending' && (
          <Card className="mb-6 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200 text-sm">
                  {language === 'es' ? 'Tu negocio está en revisión' : 'Your business is under review'}
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  {language === 'es' ? 'No puedes recibir reservas hasta ser aprobado por el administrador.' : 'You cannot receive bookings until approved by admin.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Stats Cards ────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { icon: CalendarIcon, label: language === 'es' ? 'Citas hoy' : "Today's bookings", value: stats?.today_appointments || 0, color: 'text-blue-500 bg-blue-50', type: 'today', title: language === 'es' ? 'Citas de hoy' : "Today's bookings", perm: 'view_today_bookings' },
            { icon: Clock, label: language === 'es' ? 'Confirmadas' : 'Confirmed', value: stats?.pending_appointments || 0, color: 'text-amber-500 bg-amber-50', type: 'pending', title: language === 'es' ? 'Citas confirmadas' : 'Confirmed bookings', perm: 'view_confirmed_bookings' },
            { icon: DollarSign, label: language === 'es' ? 'Ingresos mes' : 'Monthly revenue', value: formatCurrency(stats?.month_revenue || 0), color: 'text-emerald-500 bg-emerald-50', type: 'revenue', title: language === 'es' ? 'Ingresos del mes' : 'Monthly revenue', perm: 'view_reports' },
            { icon: TrendingUp, label: language === 'es' ? 'Total citas' : 'Total bookings', value: stats?.total_appointments || 0, color: 'text-violet-500 bg-violet-50', type: 'total', title: language === 'es' ? 'Total de citas' : 'Total bookings', perm: 'view_reports' },
          ].filter(stat => hasPermission(stat.perm)).map((stat, i) => (
            <Card 
              key={i} 
              className="border-border/60 cursor-pointer hover:border-[#F05D5E]/30 hover:shadow-sm transition-all"
              onClick={() => openStatsModal(stat.type, stat.title)}
              data-testid={`stat-card-${stat.type}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xl font-bold font-heading">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Tabs ────────────────────────────────────── */}
        {(() => {
          const visibleTabs = [
            { value: 'overview', show: hasPermission('view_agenda'), icon: BarChart3, label: language === 'es' ? 'Agenda' : 'Schedule' },
            { value: 'services', show: hasPermission('edit_services'), icon: Briefcase, label: language === 'es' ? 'Servicios' : 'Services' },
            { value: 'team', show: hasPermission('view_team'), icon: Users, label: language === 'es' ? 'Equipo' : 'Team' },
            { value: 'closures', show: !isManager, icon: CalendarOff, label: language === 'es' ? 'Cierres' : 'Closures' },
            { value: 'photos', show: hasPermission('edit_photos'), icon: Image, label: language === 'es' ? 'Fotos' : 'Photos' },
            { value: 'subscription', show: !isManager, icon: CreditCard, label: language === 'es' ? 'Suscripcion' : 'Subscription' },
            { value: 'activity', show: !isManager, icon: History, label: language === 'es' ? 'Actividad' : 'Activity' },
          ].filter(tab => tab.show);
          const colCount = visibleTabs.length;
          return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full max-w-3xl`} style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
            {visibleTabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} data-testid={`tab-${tab.value}`}>
                <tab.icon className="h-4 w-4 mr-1.5 hidden sm:inline" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Overview/Schedule Tab ────────────────── */}
          <TabsContent value="overview" className="mt-6">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading">{language === 'es' ? 'Calendario' : 'Calendar'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    locale={language === 'es' ? es : enUS}
                    className="rounded-md border"
                  />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-heading">
                    {language === 'es' ? 'Citas del ' : 'Bookings for '}
                    {format(selectedDate, 'PPP', { locale: language === 'es' ? es : enUS })}
                  </CardTitle>
                  <Badge variant="outline">{dayBookings.length}</Badge>
                </CardHeader>
                <CardContent>
                  {dayBookings.length > 0 ? (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      {dayBookings.map(booking => {
                        const durationMin = booking.duration_minutes || 60;
                        const blockHeight = Math.max(48, Math.min(durationMin * 0.8, 120));
                        return (
                        <div key={booking.id} className="flex items-stretch gap-0 rounded-xl border border-border/60 hover:border-[#F05D5E]/20 transition-colors overflow-hidden" data-testid={`booking-${booking.id}`} style={{minHeight: `${blockHeight}px`}}>
                          {/* Time block indicator */}
                          <div className="w-1.5 shrink-0 bg-[#F05D5E]/70 rounded-l-xl" />
                          <div className="flex items-center justify-between p-3 flex-1">
                            <div className="flex items-center gap-3">
                              <div className="w-16 text-center shrink-0">
                                <p className="text-sm font-bold">{formatTime(booking.time)}</p>
                                <p className="text-[10px] text-muted-foreground">{formatTime(booking.end_time)}</p>
                                <Badge variant="secondary" className="text-[9px] mt-0.5 px-1 py-0">{durationMin}min</Badge>
                              </div>
                              <Separator orientation="vertical" className="h-10" />
                              <div className={hasPermission('view_client_data') ? 'cursor-pointer' : ''} onClick={() => hasPermission('view_client_data') && setBookingDetail(booking)}>
                                <p className={`font-medium text-sm ${hasPermission('view_client_data') ? 'hover:text-[#F05D5E] transition-colors' : ''}`}>{booking.client_name || booking.user_name}</p>
                                <p className="text-xs text-muted-foreground">{booking.service_name}</p>
                                {booking.worker_name && <p className="text-xs text-muted-foreground/70">{booking.worker_name}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge className={`text-[10px] ${getStatusColor(booking.status)}`}>
                                {booking.status === 'cancelled' && booking.cancelled_by
                                  ? (language === 'es' 
                                    ? `Cancelada por ${booking.cancelled_by === 'business' ? 'negocio' : 'cliente'}`
                                    : `Cancelled by ${booking.cancelled_by}`)
                                  : t(`status.${booking.status}`)}
                              </Badge>
                              {booking.status === 'confirmed' && (() => {
                                const now = new Date();
                                const endDt = new Date(`${booking.date}T${booking.end_time}:00`);
                                const isPast = now >= endDt;
                                return (
                                  <>
                                    {hasPermission('complete_bookings') && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!isPast} title={!isPast ? (language === 'es' ? 'Disponible al terminar la cita' : 'Available after appointment ends') : ''} onClick={() => handleBookingAction(booking.id, 'complete')}>
                                        {language === 'es' ? 'Completar' : 'Complete'}
                                      </Button>
                                    )}
                                    {hasPermission('reschedule_bookings') && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openReschedule(booking)} data-testid={`reschedule-booking-${booking.id}`}>
                                        <RefreshCw className="h-3 w-3 mr-1" />
                                        {language === 'es' ? 'Reagendar' : 'Reschedule'}
                                      </Button>
                                    )}
                                    {hasPermission('cancel_bookings') && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleBookingAction(booking.id, 'cancel')} data-testid={`cancel-booking-${booking.id}`}>
                                        {language === 'es' ? 'Cancelar' : 'Cancel'}
                                      </Button>
                                    )}
                                  </>
                                );
                              })()}
                              {booking.status === 'hold' && (
                                <>
                                  {hasPermission('reschedule_bookings') && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openReschedule(booking)} data-testid={`reschedule-hold-${booking.id}`}>
                                      <RefreshCw className="h-3 w-3 mr-1" />
                                      {language === 'es' ? 'Reagendar' : 'Reschedule'}
                                    </Button>
                                  )}
                                  {hasPermission('cancel_bookings') && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleBookingAction(booking.id, 'cancel')} data-testid={`cancel-hold-${booking.id}`}>
                                      {language === 'es' ? 'Cancelar' : 'Cancel'}
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );})}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <CalendarIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {language === 'es' ? 'No hay citas para este día' : 'No bookings for this day'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Services Tab ─────────────────────────── */}
          <TabsContent value="services" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-heading">{language === 'es' ? 'Mis servicios' : 'My services'}</CardTitle>
                <Button size="sm" className="btn-coral" onClick={() => navigate('/business/services')} data-testid="manage-services-btn">
                  <Plus className="h-4 w-4 mr-1" />{language === 'es' ? 'Gestionar' : 'Manage'}
                </Button>
              </CardHeader>
              <CardContent>
                {services.length > 0 ? (
                  <div className="space-y-3">
                    {services.map(service => (
                      <div key={service.id} className="flex items-center justify-between p-3 rounded-xl border border-border/60" data-testid={`service-item-${service.id}`}>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{service.name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{service.duration_minutes} min</span>
                            {service.is_home_service && <Badge variant="outline" className="text-[10px] h-4">Domicilio</Badge>}
                          </div>
                        </div>
                        <span className="text-base font-bold text-[#F05D5E]">{formatCurrency(service.price)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Briefcase className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">{language === 'es' ? 'No tienes servicios' : 'No services yet'}</p>
                    <Button size="sm" className="btn-coral" onClick={() => navigate('/business/services')}>
                      <Plus className="h-4 w-4 mr-1" />{language === 'es' ? 'Agregar servicio' : 'Add service'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Team Tab ─────────────────────────────── */}
          <TabsContent value="team" className="mt-6 space-y-6">
            {/* Security PIN Section */}
            <Card className="border-amber-200/60 dark:border-amber-800/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  {language === 'es' ? 'PIN de seguridad del dueño' : 'Owner security PIN'}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {language === 'es'
                    ? 'Configura un PIN numérico para proteger acciones sensibles. Los administradores usarán su propio PIN.'
                    : 'Set a numeric PIN to protect sensitive actions. Administrators will use their own PIN.'}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${ownerHasPin ? 'bg-green-50 dark:bg-green-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                    <Shield className={`h-5 w-5 ${ownerHasPin ? 'text-green-600' : 'text-amber-500'}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {ownerHasPin
                        ? (language === 'es' ? 'PIN configurado' : 'PIN configured')
                        : (language === 'es' ? 'Sin PIN configurado' : 'No PIN configured')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ownerHasPin
                        ? (language === 'es' ? 'Tu PIN está activo y protege acciones sensibles' : 'Your PIN is active and protects sensitive actions')
                        : (language === 'es' ? 'Configura un PIN para mayor seguridad' : 'Set a PIN for extra security')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={ownerHasPin ? 'outline' : 'default'}
                    className={!ownerHasPin ? 'btn-coral' : ''}
                    onClick={() => { setPinModal({ open: true, type: 'owner_setup' }); setPinValue(''); setPinConfirm(''); }}
                    data-testid="setup-owner-pin-btn"
                  >
                    <Shield className="h-3.5 w-3.5 mr-1.5" />
                    {ownerHasPin
                      ? (language === 'es' ? 'Cambiar PIN' : 'Change PIN')
                      : (language === 'es' ? 'Configurar PIN' : 'Set PIN')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Team Members Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-heading">{language === 'es' ? 'Mi equipo' : 'My team'}</CardTitle>
                <Button size="sm" className="btn-coral" onClick={() => navigate('/business/team')} data-testid="manage-team-btn">
                  <Plus className="h-4 w-4 mr-1" />{language === 'es' ? 'Gestionar' : 'Manage'}
                </Button>
              </CardHeader>
              <CardContent>
                {workers.length > 0 ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {workers.map(worker => (
                      <div key={worker.id} className="p-3 rounded-xl border border-border/60 space-y-3" data-testid={`worker-item-${worker.id}`}>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-11 w-11">
                            <AvatarImage src={worker.photo_url} />
                            <AvatarFallback className="bg-[#F05D5E]/10 text-[#F05D5E] text-sm font-bold">
                              {getInitials(worker.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm truncate">{worker.name}</p>
                              {worker.is_manager && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] shrink-0" data-testid={`manager-badge-${worker.id}`}>
                                  <UserCog className="h-3 w-3 mr-0.5" />
                                  {language === 'es' ? 'Administrador' : 'Administrator'}
                                </Badge>
                              )}
                            </div>
                            {worker.bio && <p className="text-xs text-muted-foreground truncate">{worker.bio}</p>}
                            <p className="text-xs text-muted-foreground">{worker.service_ids?.length || 0} {language === 'es' ? 'servicios' : 'services'}</p>
                          </div>
                          <Badge variant={worker.active !== false ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                            {worker.active !== false ? (language === 'es' ? 'Activo' : 'Active') : (language === 'es' ? 'Inactivo' : 'Inactive')}
                          </Badge>
                        </div>
                        {/* Manager Actions */}
                        <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
                          {worker.is_manager ? (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => openManagerModal(worker)} data-testid={`edit-permissions-${worker.id}`}>
                                <Settings className="h-3 w-3 mr-1" />
                                {language === 'es' ? 'Permisos' : 'Permissions'}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPinModal({ open: true, type: 'manager_pin', workerId: worker.id, workerName: worker.name }); setPinValue(''); setPinConfirm(''); }} data-testid={`set-pin-${worker.id}`}>
                                <Shield className="h-3 w-3 mr-1" />
                                {worker.has_manager_pin ? (language === 'es' ? 'Cambiar PIN' : 'Change PIN') : 'PIN'}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleRemoveManager(worker)} data-testid={`remove-manager-${worker.id}`}>
                                <XCircle className="h-3 w-3 mr-1" />
                                {language === 'es' ? 'Quitar' : 'Remove'}
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 text-xs w-full text-amber-700 border-amber-200 hover:bg-amber-50" onClick={() => openManagerModal(worker)} data-testid={`designate-manager-${worker.id}`}>
                              <UserCog className="h-3 w-3 mr-1" />
                              {language === 'es' ? 'Designar como administrador' : 'Designate as administrator'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">{language === 'es' ? 'No tienes miembros en el equipo' : 'No team members yet'}</p>
                    <Button size="sm" className="btn-coral" onClick={() => navigate('/business/team')}>
                      <Plus className="h-4 w-4 mr-1" />{language === 'es' ? 'Agregar profesional' : 'Add professional'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Closures Tab ────────────────────────── */}
          <TabsContent value="closures" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading flex items-center gap-2">
                    <CalendarOff className="h-4 w-4 text-[#F05D5E]" />
                    {language === 'es' ? 'Marcar días cerrados' : 'Mark closed days'}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {language === 'es'
                      ? 'Haz clic en un día para marcarlo como cerrado. Los clientes no podrán reservar en esos días.'
                      : 'Click a day to mark it as closed. Customers won\'t be able to book on those days.'}
                  </p>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    onSelect={(date) => date && handleToggleClosure(date)}
                    disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                    locale={language === 'es' ? es : enUS}
                    modifiers={{ closed: closedDates.map(d => new Date(d + 'T12:00:00')) }}
                    modifiersClassNames={{ closed: 'bg-red-100 text-red-700 font-bold dark:bg-red-900/40 dark:text-red-400' }}
                    className="rounded-md border"
                    data-testid="closures-calendar"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-heading">
                    {language === 'es' ? 'Días cerrados programados' : 'Scheduled closures'}
                  </CardTitle>
                  <Badge variant="outline">{closures.length}</Badge>
                </CardHeader>
                <CardContent>
                  {closures.length > 0 ? (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {closures
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map(closure => {
                          const dateObj = new Date(closure.date + 'T12:00:00');
                          const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
                          return (
                            <div
                              key={closure.date}
                              className={`flex items-center justify-between p-3 rounded-xl border ${isPast ? 'opacity-50' : 'border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10'}`}
                              data-testid={`closure-${closure.date}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex flex-col items-center justify-center shrink-0">
                                  <span className="text-[10px] text-red-600 dark:text-red-400 uppercase font-medium">
                                    {dateObj.toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { month: 'short' })}
                                  </span>
                                  <span className="text-base font-bold text-red-700 dark:text-red-300">{dateObj.getDate()}</span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium capitalize">
                                    {dateObj.toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { weekday: 'long' })}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {dateObj.toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                  </p>
                                  {closure.reason && <p className="text-xs text-muted-foreground mt-0.5">{closure.reason}</p>}
                                </div>
                              </div>
                              {!isPast && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20"
                                  onClick={() => handleToggleClosure(dateObj)}
                                  data-testid={`remove-closure-${closure.date}`}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <CalendarOff className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-1">
                        {language === 'es' ? 'No tienes días cerrados' : 'No closed days scheduled'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {language === 'es' ? 'Selecciona días en el calendario para cerrar' : 'Select days in the calendar to close'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Photos Tab ───────────────────────────── */}
          <TabsContent value="photos" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base font-heading">{language === 'es' ? 'Galería de fotos' : 'Photo gallery'}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{language === 'es' ? 'Las fotos aparecerán en tu perfil público' : 'Photos will appear on your public profile'}</p>
                </div>
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-muted text-muted-foreground' : 'btn-coral text-white'}`}>
                  <Upload className="h-4 w-4" />
                  {uploading ? (language === 'es' ? 'Subiendo...' : 'Uploading...') : (language === 'es' ? 'Subir fotos' : 'Upload photos')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,.jfif"
                    multiple
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                    className="hidden"
                    data-testid="photo-upload-input"
                  />
                </label>
              </CardHeader>
              <CardContent>
                {photos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {photos.map(photo => (
                      <div key={photo.id} className="relative group aspect-square rounded-xl overflow-hidden border" data-testid={`photo-${photo.id}`}>
                        <img src={photo.url} alt={photo.original_filename} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleDeletePhoto(photo.id)} data-testid={`delete-photo-${photo.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 border-2 border-dashed rounded-xl">
                    <Image className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">{language === 'es' ? 'No tienes fotos aún' : 'No photos yet'}</p>
                    <p className="text-xs text-muted-foreground mb-4">{language === 'es' ? 'Sube fotos de tu negocio, servicios y equipo' : 'Upload photos of your business, services and team'}</p>
                    <label className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer btn-coral text-white">
                      <Upload className="h-4 w-4" />
                      {language === 'es' ? 'Subir primera foto' : 'Upload first photo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Subscription Tab ──────────────────────── */}
          <TabsContent value="subscription" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-[#F05D5E]" />
                  {language === 'es' ? 'Mi suscripcion' : 'My subscription'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Subscription status */}
                <div className="rounded-xl border p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{language === 'es' ? 'Estado' : 'Status'}</p>
                    <Badge data-testid="subscription-status-badge" className={
                      subscriptionData?.subscription_status === 'active' ? 'bg-green-100 text-green-800 border-green-200' :
                      subscriptionData?.subscription_status === 'trialing' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                      subscriptionData?.subscription_status === 'past_due' ? 'bg-red-100 text-red-800 border-red-200' :
                      subscriptionData?.subscription_status === 'canceled' ? 'bg-gray-100 text-gray-800 border-gray-200' :
                      'bg-yellow-100 text-yellow-800 border-yellow-200'
                    }>
                      {subscriptionData?.subscription_status === 'active' ? (language === 'es' ? 'Activa' : 'Active') :
                       subscriptionData?.subscription_status === 'trialing' ? (language === 'es' ? 'Periodo de prueba' : 'Trial') :
                       subscriptionData?.subscription_status === 'past_due' ? (language === 'es' ? 'Pago vencido' : 'Past due') :
                       subscriptionData?.subscription_status === 'canceled' ? (language === 'es' ? 'Cancelada' : 'Canceled') :
                       (language === 'es' ? 'Sin suscripcion' : 'No subscription')}
                    </Badge>
                  </div>

                  {subscriptionData?.subscription_status === 'trialing' && (
                    <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <Shield className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {language === 'es'
                          ? 'Estas en tu periodo de prueba gratuito de 30 dias. El primer cobro de $39 MXN se realizara automaticamente al terminar el periodo.'
                          : 'You are in your 30-day free trial. The first charge of $39 MXN will be made automatically at the end of the trial.'}
                      </p>
                    </div>
                  )}

                  {subscriptionData?.current_period_end && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{language === 'es' ? 'Proximo cobro' : 'Next charge'}</span>
                      <span className="font-medium">{new Date(subscriptionData.current_period_end).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{language === 'es' ? 'Precio' : 'Price'}</span>
                    <span className="font-medium">$39 MXN / {language === 'es' ? 'mes' : 'month'}</span>
                  </div>

                  {subscriptionData?.cancel_at_period_end && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {language === 'es'
                          ? 'Tu suscripcion esta programada para cancelarse al final del periodo actual. Despues de eso, tu negocio dejara de ser visible en la plataforma.'
                          : 'Your subscription is scheduled to cancel at the end of the current period. After that, your business will stop being visible on the platform.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Cancel button */}
                {subscriptionData?.subscription_id && !subscriptionData?.cancel_at_period_end && (
                  <div className="pt-2 border-t">
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      onClick={handleCancelSubscription}
                      disabled={cancelingSubscription}
                      data-testid="cancel-subscription-button"
                    >
                      {cancelingSubscription
                        ? (language === 'es' ? 'Cancelando...' : 'Canceling...')
                        : (language === 'es' ? 'Cancelar suscripcion' : 'Cancel subscription')}
                    </Button>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {language === 'es'
                        ? 'Si cancelas, tu negocio dejara de aparecer en la plataforma al terminar el periodo actual.'
                        : 'If you cancel, your business will stop appearing on the platform at the end of the current period.'}
                    </p>
                  </div>
                )}

                {/* No subscription - show subscribe button */}
                {(!subscriptionData?.subscription_id) && (
                  <div className="text-center py-8 border-2 border-dashed rounded-xl">
                    <CreditCard className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">{language === 'es' ? 'No tienes una suscripcion activa' : 'You have no active subscription'}</p>
                    <Button className="btn-coral" onClick={async () => {
                      try {
                        const res = await businessesAPI.createSubscription(window.location.origin);
                        if (res.data?.url) window.location.href = res.data.url;
                      } catch { toast.error(language === 'es' ? 'Error al iniciar suscripcion' : 'Error starting subscription'); }
                    }} data-testid="activate-subscription-button">
                      <CreditCard className="h-4 w-4 mr-2" />
                      {language === 'es' ? 'Activar suscripcion' : 'Activate subscription'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Activity Log Tab ────────────────────────── */}
          <TabsContent value="activity" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  {language === 'es' ? 'Historial de actividad' : 'Activity log'}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    className="text-xs border rounded-md px-2 py-1.5 bg-background"
                    value={activityFilter}
                    onChange={(e) => { setActivityFilter(e.target.value); loadActivityLogs(1, e.target.value); }}
                    data-testid="activity-filter"
                  >
                    <option value="all">{language === 'es' ? 'Todos' : 'All'}</option>
                    <option value="owner">{language === 'es' ? 'Dueño' : 'Owner'}</option>
                    <option value="admin">{language === 'es' ? 'Administradores' : 'Administrators'}</option>
                  </select>
                  <Button size="sm" variant="outline" onClick={() => loadActivityLogs(1, activityFilter)} data-testid="refresh-activity-btn">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                  </div>
                ) : activityLogs.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      {activityLogs.map(log => {
                        const actionLabels = {
                          complete_booking: { es: 'Completó cita', en: 'Completed booking', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
                          cancel_booking: { es: 'Canceló cita', en: 'Cancelled booking', icon: XCircle, color: 'text-red-600 bg-red-50' },
                          reschedule_booking: { es: 'Reagendó cita', en: 'Rescheduled booking', icon: RefreshCw, color: 'text-blue-600 bg-blue-50' },
                          designate_admin: { es: 'Designó administrador', en: 'Designated administrator', icon: UserCog, color: 'text-amber-600 bg-amber-50' },
                          remove_admin: { es: 'Removió administrador', en: 'Removed administrator', icon: XCircle, color: 'text-orange-600 bg-orange-50' },
                          update_permissions: { es: 'Actualizó permisos', en: 'Updated permissions', icon: Shield, color: 'text-violet-600 bg-violet-50' },
                        };
                        const meta = actionLabels[log.action] || { es: log.action, en: log.action, icon: History, color: 'text-gray-600 bg-gray-50' };
                        const IconComp = meta.icon;
                        const dt = new Date(log.created_at);
                        const timeStr = dt.toLocaleTimeString(language === 'es' ? 'es-MX' : 'en-US', { hour: '2-digit', minute: '2-digit' });
                        const dateStr = dt.toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short' });

                        return (
                          <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/20 transition-colors" data-testid={`activity-log-${log.id}`}>
                            <div className={`p-2 rounded-lg shrink-0 ${meta.color}`}>
                              <IconComp className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{meta[language] || meta.es}</span>
                                <Badge variant={log.actor_type === 'admin' ? 'outline' : 'secondary'} className="text-[10px]">
                                  {log.actor_type === 'admin' ? (
                                    <><UserCog className="h-2.5 w-2.5 mr-0.5" />{log.actor_name}</>
                                  ) : (
                                    <><Shield className="h-2.5 w-2.5 mr-0.5" />{language === 'es' ? 'Dueño' : 'Owner'}</>
                                  )}
                                </Badge>
                              </div>
                              {/* Details line */}
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {log.details?.client_name && `${log.details.client_name} — `}
                                {log.details?.service_name && `${log.details.service_name} `}
                                {log.details?.date && `(${new Date(log.details.date + 'T12:00:00').toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short' })})`}
                                {log.details?.worker_name && !log.details?.client_name && log.details.worker_name}
                                {log.action === 'reschedule_booking' && log.details?.old_date && (
                                  <> → {log.details.new_date} {log.details.new_time}</>
                                )}
                                {log.details?.reason && ` — ${log.details.reason}`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-muted-foreground">{dateStr}</p>
                              <p className="text-[10px] text-muted-foreground/70">{timeStr}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Pagination */}
                    {activityPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t">
                        <Button size="sm" variant="outline" disabled={activityPage <= 1} onClick={() => loadActivityLogs(activityPage - 1, activityFilter)} data-testid="activity-prev-page">
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground">{activityPage} / {activityPages}</span>
                        <Button size="sm" variant="outline" disabled={activityPage >= activityPages} onClick={() => loadActivityLogs(activityPage + 1, activityFilter)} data-testid="activity-next-page">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <History className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">{language === 'es' ? 'No hay actividad registrada aún' : 'No activity recorded yet'}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {language === 'es' ? 'Las acciones de dueños y administradores aparecerán aquí' : 'Owner and administrator actions will appear here'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
          );
        })()}

        {/* ── Stats Detail Modal ─────────────────────── */}
        <Dialog open={statsModal.open} onOpenChange={(open) => { if (!open) closeStatsModal(); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="stats-detail-modal">
            <DialogHeader>
              <DialogTitle className="font-heading">{statsModal.title}</DialogTitle>
              <DialogDescription>
                {statsModal.type === 'revenue' 
                  ? (language === 'es' ? 'Citas completadas con ingresos' : 'Completed bookings with revenue')
                  : (language === 'es' ? 'Lista de citas' : 'Bookings list')}
              </DialogDescription>
            </DialogHeader>

            {/* Date Range Filter (for total and revenue) */}
            {(statsModal.type === 'total' || statsModal.type === 'revenue') && (
              <div className="flex items-end gap-2 pb-2 border-b">
                <div className="flex-1">
                  <Label className="text-xs">{language === 'es' ? 'Desde' : 'From'}</Label>
                  <Input type="date" value={statsDateFrom} onChange={e => setStatsDateFrom(e.target.value)} data-testid="stats-date-from" />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">{language === 'es' ? 'Hasta' : 'To'}</Label>
                  <Input type="date" value={statsDateTo} onChange={e => setStatsDateTo(e.target.value)} data-testid="stats-date-to" />
                </div>
                <Button size="sm" className="btn-coral shrink-0" onClick={() => openStatsModal(statsModal.type, statsModal.title, statsDateFrom, statsDateTo)} data-testid="stats-filter-btn">
                  {language === 'es' ? 'Filtrar' : 'Filter'}
                </Button>
              </div>
            )}

            {/* Results */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {statsModal.loading ? (
                <div className="space-y-3 py-4">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : statsModal.bookings.length > 0 ? (
                <>
                  {statsModal.totalRevenue !== null && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200">
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        {language === 'es' ? 'Ingresos totales' : 'Total revenue'}
                      </span>
                      <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300" data-testid="stats-total-revenue">
                        {formatCurrency(statsModal.totalRevenue)}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{statsModal.bookings.length} {language === 'es' ? 'citas' : 'bookings'}</p>
                  {statsModal.bookings.map(b => (
                    <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/60" data-testid={`stats-booking-${b.id}`}>
                      <div className="w-14 text-center shrink-0">
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">
                          {new Date(b.date + 'T12:00:00').toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { month: 'short' })}
                        </p>
                        <p className="text-lg font-bold leading-none">{new Date(b.date + 'T12:00:00').getDate()}</p>
                      </div>
                      <Separator orientation="vertical" className="h-10" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.client_name || b.user_name || (language === 'es' ? 'Cliente' : 'Client')}</p>
                        <p className="text-xs text-muted-foreground truncate">{b.service_name}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <span>{formatTime(b.time)} - {formatTime(b.end_time)}</span>
                          {b.worker_name && <span>| {b.worker_name}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge className={`text-[10px] ${getStatusColor(b.status)}`}>
                          {t(`status.${b.status}`)}
                        </Badge>
                        {b.total_amount && (
                          <span className="text-xs font-medium text-[#F05D5E]">{formatCurrency(b.total_amount)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-12">
                  <CalendarIcon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">{language === 'es' ? 'No hay citas' : 'No bookings'}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Reschedule Modal */}
        <Dialog open={rescheduleModal.open} onOpenChange={(open) => !open && setRescheduleModal({ open: false, booking: null })}>
          <DialogContent className="max-w-md" data-testid="reschedule-modal">
            <DialogHeader>
              <DialogTitle>{language === 'es' ? 'Reagendar Cita' : 'Reschedule Appointment'}</DialogTitle>
              <DialogDescription>
                {rescheduleModal.booking && (
                  <span>
                    {rescheduleModal.booking.user_name || rescheduleModal.booking.client_name} — {rescheduleModal.booking.service_name}
                    <br />
                    {language === 'es' ? 'Fecha actual:' : 'Current date:'} {rescheduleModal.booking.date} {rescheduleModal.booking.time}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-sm font-medium mb-2 block">{language === 'es' ? 'Nueva fecha' : 'New date'}</Label>
                <Calendar
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={(date) => {
                    setRescheduleDate(date);
                    setRescheduleTime('');
                    if (date) loadRescheduleSlots(date);
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                  locale={language === 'es' ? es : enUS}
                  className="rounded-md border mx-auto"
                />
              </div>

              {rescheduleDate && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    {language === 'es' ? 'Horario disponible' : 'Available time'} — {format(rescheduleDate, 'dd MMM yyyy', { locale: language === 'es' ? es : enUS })}
                  </Label>
                  {slotsLoading ? (
                    <div className="flex gap-2 flex-wrap">
                      {[1,2,3,4].map(i => <Skeleton key={i} className="h-9 w-20" />)}
                    </div>
                  ) : rescheduleSlots.length > 0 ? (
                    <div className="flex gap-2 flex-wrap max-h-40 overflow-y-auto">
                      {rescheduleSlots.map(slot => (
                        <Button
                          key={slot.time}
                          size="sm"
                          variant={rescheduleTime === slot.time ? 'default' : 'outline'}
                          className="h-9 text-xs"
                          onClick={() => setRescheduleTime(slot.time)}
                          data-testid={`slot-${slot.time}`}
                        >
                          {slot.time}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{language === 'es' ? 'No hay horarios disponibles para esta fecha' : 'No available slots for this date'}</p>
                  )}
                </div>
              )}

              <Button
                className="w-full"
                disabled={!rescheduleDate || !rescheduleTime || rescheduleLoading}
                onClick={handleReschedule}
                data-testid="confirm-reschedule-btn"
              >
                {rescheduleLoading
                  ? (language === 'es' ? 'Reagendando...' : 'Rescheduling...')
                  : (language === 'es' ? 'Confirmar reagendamiento' : 'Confirm reschedule')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Booking Detail Modal */}
        <Dialog open={!!bookingDetail} onOpenChange={(open) => !open && setBookingDetail(null)}>
          <DialogContent className="max-w-sm" data-testid="booking-detail-modal">
            <DialogHeader>
              <DialogTitle>{language === 'es' ? 'Detalle de la cita' : 'Booking detail'}</DialogTitle>
              <DialogDescription>
                {language === 'es' ? 'Información del cliente y la cita' : 'Client and booking information'}
              </DialogDescription>
            </DialogHeader>
            {bookingDetail && (() => {
              const b = bookingDetail;
              const name = b.client_name || b.user_name || (language === 'es' ? 'Sin nombre' : 'No name');
              const email = b.client_email || b.user_email;
              const phone = b.client_phone || b.user_phone;
              return (
                <div className="space-y-4 mt-1">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#F05D5E]/10 flex items-center justify-center text-[#F05D5E] font-bold text-lg">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{name}</p>
                      <Badge className={`text-[10px] ${getStatusColor(b.status)}`}>
                        {b.status === 'cancelled' && b.cancelled_by
                          ? (language === 'es' ? `Cancelada por ${b.cancelled_by === 'business' ? 'negocio' : 'cliente'}` : `Cancelled by ${b.cancelled_by}`)
                          : t(`status.${b.status}`)}
                      </Badge>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid gap-2.5 text-sm">
                    {email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={`mailto:${email}`} className="text-blue-600 hover:underline truncate">{email}</a>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={`tel:${phone}`} className="text-blue-600 hover:underline">{phone}</a>
                      </div>
                    )}
                    {!email && !phone && (
                      <p className="text-muted-foreground text-xs italic">{language === 'es' ? 'No hay datos de contacto disponibles' : 'No contact info available'}</p>
                    )}
                  </div>
                  <Separator />
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'es' ? 'Servicio' : 'Service'}</span>
                      <span className="font-medium">{b.service_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'es' ? 'Profesional' : 'Professional'}</span>
                      <span className="font-medium">{b.worker_name || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'es' ? 'Fecha' : 'Date'}</span>
                      <span className="font-medium">{new Date(b.date + 'T12:00:00').toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'es' ? 'Horario' : 'Time'}</span>
                      <span className="font-medium">{b.time} - {b.end_time}</span>
                    </div>
                    {b.deposit_amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{language === 'es' ? 'Anticipo' : 'Deposit'}</span>
                        <span className="font-medium">{b.deposit_paid ? '✓' : '✗'} ${b.deposit_amount} MXN</span>
                      </div>
                    )}
                    {b.total_amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-medium">${b.total_amount} MXN</span>
                      </div>
                    )}
                    {b.notes && (
                      <div className="mt-1">
                        <p className="text-muted-foreground text-xs mb-1">{language === 'es' ? 'Notas' : 'Notes'}</p>
                        <p className="text-sm bg-muted/50 p-2 rounded">{b.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Manager Permissions Modal */}
        <Dialog open={managerModal.open} onOpenChange={(open) => !open && setManagerModal({ open: false, worker: null })}>
          <DialogContent className="max-w-md" data-testid="manager-permissions-modal">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-amber-500" />
                {managerModal.worker?.is_manager
                  ? (language === 'es' ? 'Editar permisos de administrador' : 'Edit administrator permissions')
                  : (language === 'es' ? 'Designar como administrador' : 'Designate as administrator')}
              </DialogTitle>
              <DialogDescription>
                {managerModal.worker?.name} — {language === 'es'
                  ? 'Selecciona las acciones que este administrador puede realizar'
                  : 'Select the actions this administrator can perform'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 mt-2 max-h-[50vh] overflow-y-auto pr-1">
              {Object.entries(PERMISSION_GROUPS[language] || PERMISSION_GROUPS.es).map(([groupName, permKeys]) => (
                <div key={groupName}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{groupName}</p>
                  <div className="space-y-2">
                    {permKeys.map(key => (
                      <div key={key} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors" data-testid={`perm-${key}`}>
                        <Label className="text-sm cursor-pointer flex-1" htmlFor={`perm-switch-${key}`}>
                          {PERMISSION_LABELS[key]?.[language] || key}
                        </Label>
                        <Switch
                          id={`perm-switch-${key}`}
                          checked={!!managerPermissions[key]}
                          onCheckedChange={(checked) => setManagerPermissions(prev => ({ ...prev, [key]: checked }))}
                          data-testid={`switch-${key}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2 mt-2">
              <Button variant="outline" onClick={() => setManagerModal({ open: false, worker: null })} data-testid="cancel-manager-modal">
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </Button>
              <Button
                className="btn-coral"
                onClick={managerModal.worker?.is_manager ? handleUpdatePermissions : handleDesignateManager}
                data-testid="save-manager-btn"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {managerModal.worker?.is_manager
                  ? (language === 'es' ? 'Guardar permisos' : 'Save permissions')
                  : (language === 'es' ? 'Designar administrador' : 'Designate administrator')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PIN Setup Modal */}
        <Dialog open={pinModal.open} onOpenChange={(open) => { if (!open) { setPinModal({ open: false, type: null }); setPinValue(''); setPinConfirm(''); } }}>
          <DialogContent className="max-w-sm" data-testid="pin-setup-modal">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-500" />
                {pinModal.type === 'owner_setup'
                  ? (language === 'es' ? 'PIN de seguridad del dueño' : 'Owner security PIN')
                  : (language === 'es' ? `PIN para ${pinModal.workerName || 'administrador'}` : `PIN for ${pinModal.workerName || 'administrator'}`)}
              </DialogTitle>
              <DialogDescription>
                {language === 'es'
                  ? 'Ingresa un PIN numérico de 4 a 6 dígitos'
                  : 'Enter a numeric PIN of 4 to 6 digits'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-sm mb-1.5 block">{language === 'es' ? 'Nuevo PIN' : 'New PIN'}</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••"
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  data-testid="pin-input"
                  data-no-capitalize="true"
                />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">{language === 'es' ? 'Confirmar PIN' : 'Confirm PIN'}</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  data-testid="pin-confirm-input"
                  data-no-capitalize="true"
                />
              </div>
              {pinValue && pinConfirm && pinValue !== pinConfirm && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  {language === 'es' ? 'Los PINs no coinciden' : 'PINs do not match'}
                </p>
              )}
              {pinValue && pinValue.length >= 4 && pinValue === pinConfirm && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {language === 'es' ? 'PINs coinciden' : 'PINs match'}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 mt-2">
              <Button variant="outline" onClick={() => { setPinModal({ open: false, type: null }); setPinValue(''); setPinConfirm(''); }} data-testid="cancel-pin-modal">
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </Button>
              <Button
                className="btn-coral"
                disabled={pinValue.length < 4 || pinValue !== pinConfirm}
                onClick={pinModal.type === 'owner_setup' ? handleSaveOwnerPin : handleSetManagerPin}
                data-testid="save-pin-btn"
              >
                <Shield className="h-4 w-4 mr-1.5" />
                {language === 'es' ? 'Guardar PIN' : 'Save PIN'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
