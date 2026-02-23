import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { businessesAPI, bookingsAPI, servicesAPI } from '@/lib/api';
import { formatDate, formatTime, formatCurrency, getStatusColor } from '@/lib/utils';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon, DollarSign, Star, Users, Clock, CheckCircle2, 
  XCircle, AlertTriangle, TrendingUp, Settings, BarChart3, UserCog
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
      const [dashRes, servicesRes] = await Promise.all([
        businessesAPI.getDashboard(),
        servicesAPI.getByBusiness(business?.id || ''),
      ]);
      setDashboardData(dashRes.data);
      setServices(servicesRes.data);
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
      setDayBookings(res.data);
    } catch (error) {
      console.error('Error loading bookings:', error);
    }
  };

  const handleBookingAction = async (bookingId, action) => {
    try {
      switch (action) {
        case 'confirm':
          await bookingsAPI.confirm(bookingId);
          toast.success(language === 'es' ? 'Cita confirmada' : 'Booking confirmed');
          break;
        case 'complete':
          await bookingsAPI.complete(bookingId);
          toast.success(language === 'es' ? 'Cita completada' : 'Booking completed');
          break;
        case 'no-show':
          await bookingsAPI.markNoShow(bookingId);
          toast.success(language === 'es' ? 'Marcado como no asistió' : 'Marked as no-show');
          break;
        case 'cancel':
          await bookingsAPI.cancel(bookingId);
          toast.success(language === 'es' ? 'Cita cancelada' : 'Booking cancelled');
          break;
        default:
          break;
      }
      loadDayBookings();
      loadDashboard();
    } catch (error) {
      toast.error(language === 'es' ? 'Error al actualizar' : 'Error updating');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </div>
    );
  }

  const biz = dashboardData?.business;
  const stats = dashboardData?.stats;

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="business-dashboard-page">
      <div className="container-app py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold">{biz?.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge className={getStatusColor(biz?.status)}>
                {biz?.status === 'approved' 
                  ? (language === 'es' ? 'Aprobado' : 'Approved')
                  : biz?.status === 'pending'
                  ? (language === 'es' ? 'En revisión' : 'Under review')
                  : biz?.status}
              </Badge>
              {biz?.rating > 0 && (
                <span className="flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {biz?.rating.toFixed(1)} ({biz?.review_count} {t('business.reviews')})
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/business/settings')}>
            <Settings className="h-4 w-4 mr-2" />
            {language === 'es' ? 'Configuración' : 'Settings'}
          </Button>
        </div>

        {/* Status Alert */}
        {biz?.status === 'pending' && (
          <Card className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  {language === 'es' ? 'Tu negocio está en revisión' : 'Your business is under review'}
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  {language === 'es' 
                    ? 'Tu perfil es visible pero no puedes recibir reservas hasta ser aprobado.'
                    : 'Your profile is visible but you cannot receive bookings until approved.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <CalendarIcon className="h-8 w-8 text-blue-500" />
                <span className="text-3xl font-bold">{stats?.today_appointments || 0}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {language === 'es' ? 'Citas hoy' : 'Today\'s bookings'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Clock className="h-8 w-8 text-yellow-500" />
                <span className="text-3xl font-bold">{stats?.pending_appointments || 0}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {language === 'es' ? 'Pendientes' : 'Pending'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <DollarSign className="h-8 w-8 text-green-500" />
                <span className="text-2xl font-bold">{formatCurrency(stats?.month_revenue || 0)}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {language === 'es' ? 'Ingresos del mes' : 'Monthly revenue'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Star className="h-8 w-8 text-yellow-400" />
                <span className="text-3xl font-bold">{stats?.rating?.toFixed(1) || '0.0'}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {stats?.total_reviews || 0} {t('business.reviews')}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Calendar */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="font-heading">
                {language === 'es' ? 'Calendario' : 'Calendar'}
              </CardTitle>
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

          {/* Day Bookings */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading">
                {language === 'es' ? 'Citas del ' : 'Bookings for '}
                {format(selectedDate, 'PPP', { locale: language === 'es' ? es : enUS })}
              </CardTitle>
              <Badge variant="outline">{dayBookings.length} {language === 'es' ? 'citas' : 'bookings'}</Badge>
            </CardHeader>
            <CardContent>
              {dayBookings.length > 0 ? (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {dayBookings.map(booking => (
                    <div 
                      key={booking.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-muted/50"
                      data-testid={`booking-${booking.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center min-w-[60px]">
                          <p className="text-lg font-bold">{formatTime(booking.time)}</p>
                          <p className="text-xs text-muted-foreground">{booking.end_time}</p>
                        </div>
                        <div>
                          <p className="font-medium">{booking.user_name}</p>
                          <p className="text-sm text-muted-foreground">{booking.service_name}</p>
                          <p className="text-xs text-muted-foreground">{booking.worker_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(booking.status)}>
                          {t(`status.${booking.status}`)}
                        </Badge>
                        {booking.status === 'pending' && (
                          <>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              className="text-green-600 hover:bg-green-50"
                              onClick={() => handleBookingAction(booking.id, 'confirm')}
                            >
                              <CheckCircle2 className="h-5 w-5" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => handleBookingAction(booking.id, 'cancel')}
                            >
                              <XCircle className="h-5 w-5" />
                            </Button>
                          </>
                        )}
                        {booking.status === 'confirmed' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleBookingAction(booking.id, 'complete')}
                            >
                              {language === 'es' ? 'Completar' : 'Complete'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-yellow-600"
                              onClick={() => handleBookingAction(booking.id, 'no-show')}
                            >
                              No show
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {language === 'es' ? 'No hay citas para este día' : 'No bookings for this day'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Services */}
        <Card className="mt-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading">{t('business.services')}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate('/business/services')}>
              {language === 'es' ? 'Gestionar servicios' : 'Manage services'}
            </Button>
          </CardHeader>
          <CardContent>
            {services.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {services.map(service => (
                  <div key={service.id} className="p-4 rounded-xl bg-muted/50">
                    <h4 className="font-medium">{service.name}</h4>
                    <p className="text-sm text-muted-foreground">{service.duration_minutes} min</p>
                    <p className="text-lg font-bold text-[#F05D5E] mt-2">{formatCurrency(service.price)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {language === 'es' ? 'No tienes servicios configurados' : 'No services configured'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
