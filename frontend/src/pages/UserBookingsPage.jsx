import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { bookingsAPI } from '@/lib/api';
import { formatDate, formatTime, formatCurrency, getStatusColor, getInitials } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Calendar, Clock, MapPin, User, ChevronRight, AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react';

export default function UserBookingsPage() {
  const { t, language } = useI18n();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadBookings();
  }, [isAuthenticated]);

  const loadBookings = async () => {
    try {
      const [upcomingRes, pastRes] = await Promise.all([
        bookingsAPI.getMy({ upcoming: true }),
        bookingsAPI.getMy({ upcoming: false }),
      ]);
      setUpcomingBookings(upcomingRes.data);
      setPastBookings(pastRes.data);
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (bookingId) => {
    if (!window.confirm(language === 'es' ? '¿Estás seguro de cancelar esta cita?' : 'Are you sure you want to cancel this booking?')) {
      return;
    }

    try {
      await bookingsAPI.cancel(bookingId);
      toast.success(language === 'es' ? 'Cita cancelada' : 'Booking cancelled');
      loadBookings();
    } catch (error) {
      const message = error.response?.data?.detail || (language === 'es' ? 'Error al cancelar' : 'Error cancelling');
      toast.error(message);
    }
  };

  const BookingCard = ({ booking, showActions = true }) => (
    <Card className="overflow-hidden hover:border-[#F05D5E]/30 transition-colors" data-testid={`booking-card-${booking.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-muted flex flex-col items-center justify-center flex-shrink-0">
            <span className="text-xs text-muted-foreground uppercase">
              {new Date(booking.date).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { month: 'short' })}
            </span>
            <span className="text-2xl font-bold">{new Date(booking.date).getDate()}</span>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-heading font-bold text-lg line-clamp-1">{booking.service_name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-1">{booking.business_name}</p>
              </div>
              <Badge className={getStatusColor(booking.status)}>
                {t(`status.${booking.status}`)}
              </Badge>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatTime(booking.time)}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {booking.worker_name}
              </span>
            </div>

            {showActions && (booking.status === 'pending' || booking.status === 'confirmed') && (
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCancel(booking.id)}
                  className="text-red-600 hover:bg-red-50"
                  data-testid={`cancel-booking-${booking.id}`}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/business/${booking.business_slug || booking.business_id}`)}
                >
                  {language === 'es' ? 'Ver negocio' : 'View business'}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}

            {booking.status === 'completed' && !booking.has_review && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => navigate(`/review/${booking.id}`)}
              >
                {language === 'es' ? 'Dejar reseña' : 'Leave review'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-4 flex gap-4">
                  <Skeleton className="w-16 h-16 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="bookings-page">
      <div className="container-app py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold">{t('nav.bookings')}</h1>
            <p className="text-muted-foreground mt-1">
              {language === 'es' ? 'Gestiona tus citas' : 'Manage your appointments'}
            </p>
          </div>
          <Button className="btn-coral" onClick={() => navigate('/search')} data-testid="new-booking-button">
            {language === 'es' ? 'Nueva reserva' : 'New booking'}
          </Button>
        </div>

        {/* Warnings */}
        {user?.cancellation_count >= 2 && user?.cancellation_count < 4 && (
          <Card className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {language === 'es' 
                  ? `Has cancelado ${user.cancellation_count} citas. Con 4 cancelaciones tu cuenta será suspendida por 15 días.`
                  : `You have cancelled ${user.cancellation_count} appointments. With 4 cancellations your account will be suspended for 15 days.`}
              </p>
            </CardContent>
          </Card>
        )}

        {user?.active_appointments_count >= 4 && (
          <Card className="mb-6 border-blue-500 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-blue-600" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {language === 'es' 
                  ? `Tienes ${user.active_appointments_count} de 5 citas activas permitidas.`
                  : `You have ${user.active_appointments_count} of 5 active appointments allowed.`}
              </p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="upcoming" data-testid="upcoming-tab">
              {t('dashboard.upcoming')} ({upcomingBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past" data-testid="past-tab">
              {t('dashboard.past')} ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-6 space-y-4">
            {upcomingBookings.length > 0 ? (
              upcomingBookings.map(booking => (
                <BookingCard key={booking.id} booking={booking} />
              ))
            ) : (
              <Card className="p-12 text-center">
                <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-heading font-bold text-xl mb-2">{t('dashboard.noBookings')}</h3>
                <p className="text-muted-foreground mb-6">
                  {language === 'es' 
                    ? '¿Listo para reservar tu próxima cita?'
                    : 'Ready to book your next appointment?'}
                </p>
                <Button className="btn-coral" onClick={() => navigate('/search')}>
                  {t('dashboard.explore')}
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-6 space-y-4">
            {pastBookings.length > 0 ? (
              pastBookings.map(booking => (
                <BookingCard key={booking.id} booking={booking} showActions={false} />
              ))
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">
                  {language === 'es' ? 'No tienes citas pasadas' : 'No past appointments'}
                </p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
