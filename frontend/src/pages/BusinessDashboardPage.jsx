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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { businessesAPI, bookingsAPI, servicesAPI } from '@/lib/api';
import { formatDate, formatTime, formatCurrency, getStatusColor, getInitials } from '@/lib/utils';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon, DollarSign, Star, Users, Clock, CheckCircle2,
  XCircle, AlertTriangle, TrendingUp, Settings, UserCog, Image, Upload,
  Trash2, Eye, Plus, Pencil, BarChart3, Briefcase, ArrowUpRight, Phone,
  Ban, CalendarOff, CreditCard, Shield
} from 'lucide-react';

export default function BusinessDashboardPage() {
  const { t, language } = useI18n();
  const { business, isAuthenticated, isBusiness } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
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

  useEffect(() => {
    if (!isAuthenticated || !isBusiness) {
      navigate('/business/login');
      return;
    }
    loadDashboard();
  }, [isAuthenticated, isBusiness]);

  useEffect(() => {
    if (dashboardData?.business?.id) {
      loadDayBookings();
    }
  }, [selectedDate, dashboardData]);

  const loadDashboard = async () => {
    try {
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
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDayBookings = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await bookingsAPI.getBusiness({ date: dateStr });
      setDayBookings(Array.isArray(res.data) ? res.data : []);
    } catch {
      setDayBookings([]);
    }
  };

  const handleBookingAction = async (bookingId, action) => {
    try {
      switch (action) {
        case 'confirm': await bookingsAPI.confirm(bookingId); break;
        case 'complete': await bookingsAPI.complete(bookingId); break;
        case 'no-show': await bookingsAPI.markNoShow(bookingId); break;
        case 'cancel': await bookingsAPI.cancel(bookingId); break;
        default: break;
      }
      toast.success(language === 'es' ? 'Actualizado' : 'Updated');
      loadDayBookings();
      loadDashboard();
    } catch {
      toast.error(language === 'es' ? 'Error al actualizar' : 'Error updating');
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const profileSlug = biz?.slug || biz?.id;
              if (profileSlug) navigate(`/business/${profileSlug}`);
              else toast.error(language === 'es' ? 'Perfil no disponible' : 'Profile not available');
            }} data-testid="view-profile-button">
              <Eye className="h-4 w-4 mr-1.5" />{language === 'es' ? 'Ver perfil' : 'View profile'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/business/settings')}>
              <Settings className="h-4 w-4 mr-1.5" />{language === 'es' ? 'Config' : 'Settings'}
            </Button>
          </div>
        </div>

        {/* Status Alert */}
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
            { icon: CalendarIcon, label: language === 'es' ? 'Citas hoy' : "Today's bookings", value: stats?.today_appointments || 0, color: 'text-blue-500 bg-blue-50', type: 'today', title: language === 'es' ? 'Citas de hoy' : "Today's bookings" },
            { icon: Clock, label: language === 'es' ? 'Confirmadas' : 'Confirmed', value: stats?.pending_appointments || 0, color: 'text-amber-500 bg-amber-50', type: 'pending', title: language === 'es' ? 'Citas confirmadas' : 'Confirmed bookings' },
            { icon: DollarSign, label: language === 'es' ? 'Ingresos mes' : 'Monthly revenue', value: formatCurrency(stats?.month_revenue || 0), color: 'text-emerald-500 bg-emerald-50', type: 'revenue', title: language === 'es' ? 'Ingresos del mes' : 'Monthly revenue' },
            { icon: TrendingUp, label: language === 'es' ? 'Total citas' : 'Total bookings', value: stats?.total_appointments || 0, color: 'text-violet-500 bg-violet-50', type: 'total', title: language === 'es' ? 'Total de citas' : 'Total bookings' },
          ].map((stat, i) => (
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 max-w-3xl">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="h-4 w-4 mr-1.5 hidden sm:inline" />
              {language === 'es' ? 'Agenda' : 'Schedule'}
            </TabsTrigger>
            <TabsTrigger value="services" data-testid="tab-services">
              <Briefcase className="h-4 w-4 mr-1.5 hidden sm:inline" />
              {language === 'es' ? 'Servicios' : 'Services'}
            </TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">
              <Users className="h-4 w-4 mr-1.5 hidden sm:inline" />
              {language === 'es' ? 'Equipo' : 'Team'}
            </TabsTrigger>
            <TabsTrigger value="closures" data-testid="tab-closures">
              <CalendarOff className="h-4 w-4 mr-1.5 hidden sm:inline" />
              {language === 'es' ? 'Cierres' : 'Closures'}
            </TabsTrigger>
            <TabsTrigger value="photos" data-testid="tab-photos">
              <Image className="h-4 w-4 mr-1.5 hidden sm:inline" />
              {language === 'es' ? 'Fotos' : 'Photos'}
            </TabsTrigger>
            <TabsTrigger value="subscription" data-testid="tab-subscription">
              <CreditCard className="h-4 w-4 mr-1.5 hidden sm:inline" />
              {language === 'es' ? 'Suscripcion' : 'Subscription'}
            </TabsTrigger>
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
                              <div>
                                <p className="font-medium text-sm">{booking.user_name}</p>
                                <p className="text-xs text-muted-foreground">{booking.service_name}</p>
                                {booking.worker_name && <p className="text-xs text-muted-foreground/70">{booking.worker_name}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge className={`text-[10px] ${getStatusColor(booking.status)}`}>
                                {t(`status.${booking.status}`)}
                              </Badge>
                              {booking.status === 'pending' && (
                                <>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={() => handleBookingAction(booking.id, 'confirm')}>
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => handleBookingAction(booking.id, 'cancel')}>
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {booking.status === 'confirmed' && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBookingAction(booking.id, 'complete')}>
                                  {language === 'es' ? 'Completar' : 'Complete'}
                                </Button>
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
          <TabsContent value="team" className="mt-6">
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
                      <div key={worker.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/60" data-testid={`worker-item-${worker.id}`}>
                        <Avatar className="h-11 w-11">
                          <AvatarImage src={worker.photo_url} />
                          <AvatarFallback className="bg-[#F05D5E]/10 text-[#F05D5E] text-sm font-bold">
                            {getInitials(worker.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{worker.name}</p>
                          {worker.bio && <p className="text-xs text-muted-foreground truncate">{worker.bio}</p>}
                          <p className="text-xs text-muted-foreground">{worker.service_ids?.length || 0} {language === 'es' ? 'servicios' : 'services'}</p>
                        </div>
                        <Badge variant={worker.active !== false ? 'default' : 'secondary'} className="text-[10px]">
                          {worker.active !== false ? (language === 'es' ? 'Activo' : 'Active') : (language === 'es' ? 'Inactivo' : 'Inactive')}
                        </Badge>
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
        </Tabs>

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
                        <p className="text-sm font-medium truncate">{b.user_name || (language === 'es' ? 'Cliente' : 'Client')}</p>
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
      </div>
    </div>
  );
}
