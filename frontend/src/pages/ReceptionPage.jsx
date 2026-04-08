import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { businessesAPI, bookingsAPI, servicesAPI } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/utils';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  ArrowLeft, Clock, User, Phone, Mail, FileText, Loader2,
  CheckCircle2, CalendarDays, Scissors, UserCog
} from 'lucide-react';

export default function ReceptionPage() {
  const { user, authLoading } = useAuth();
  const { language } = useI18n();
  const navigate = useNavigate();
  const t = (esText, enText) => language === 'es' ? esText : enText;

  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedService, setSelectedService] = useState('');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientNotes, setClientNotes] = useState('');

  // Availability
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Today's bookings
  const [todayBookings, setTodayBookings] = useState([]);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'business')) {
      navigate('/login');
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (user?.role === 'business') loadInitialData();
  }, [user]);

  const loadInitialData = async () => {
    try {
      const [dashRes, todayRes] = await Promise.all([
        businessesAPI.getDashboard(),
        bookingsAPI.getBusiness({ date_from: format(new Date(), 'yyyy-MM-dd'), date_to: format(new Date(), 'yyyy-MM-dd') })
      ]);
      const biz = dashRes.data?.business;
      setBusiness(biz);
      setTodayBookings(todayRes.data?.filter(b => b.status !== 'cancelled' && b.status !== 'expired') || []);

      if (biz?.id) {
        const [svcRes, wkrRes] = await Promise.all([
          servicesAPI.getByBusiness(biz.id),
          businessesAPI.getWorkers(biz.id)
        ]);
        setServices(svcRes.data?.filter(s => s.active !== false) || []);
        setWorkers(wkrRes.data?.filter(w => w.active !== false) || []);
      }
    } catch (e) {
      toast.error(t('Error al cargar datos', 'Error loading data'));
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = useCallback(async () => {
    if (!business?.id || !selectedService || !selectedDate) return;
    setSlotsLoading(true);
    setSelectedTime('');
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await bookingsAPI.getAvailability(business.id, dateStr, selectedService, selectedWorker || undefined);
      const available = (res.data?.slots || []).filter(s => s.status === 'available');
      setSlots(available);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [business?.id, selectedService, selectedWorker, selectedDate]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const handleSubmit = async () => {
    if (!selectedService || !selectedTime || !clientName.trim()) {
      toast.error(t('Completa servicio, horario y nombre del cliente', 'Fill in service, time and client name'));
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        business_id: business.id,
        service_id: selectedService,
        worker_id: selectedWorker || workers[0]?.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        skip_payment: true,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || undefined,
        client_email: clientEmail.trim() || undefined,
        client_info: clientNotes.trim() || undefined,
      };
      await bookingsAPI.create(data);
      setSuccess(true);
      toast.success(t('Cita registrada exitosamente', 'Appointment registered successfully'));

      // Reload today bookings
      const todayRes = await bookingsAPI.getBusiness({ date_from: format(new Date(), 'yyyy-MM-dd'), date_to: format(new Date(), 'yyyy-MM-dd') });
      setTodayBookings(todayRes.data?.filter(b => b.status !== 'cancelled' && b.status !== 'expired') || []);

      // Reset form
      setTimeout(() => {
        setSuccess(false);
        setSelectedTime('');
        setClientName('');
        setClientPhone('');
        setClientEmail('');
        setClientNotes('');
        loadAvailability();
      }, 2000);
    } catch (e) {
      const msg = e.response?.data?.detail || t('Error al registrar la cita', 'Error registering appointment');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedServiceObj = services.find(s => s.id === selectedService);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#F05D5E]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20 pb-8 px-4" data-testid="reception-page">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/business/dashboard')} data-testid="back-to-dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-heading font-bold">{t('Recepcion', 'Reception')}</h1>
            <p className="text-sm text-muted-foreground">{t('Agenda citas para tus clientes', 'Book appointments for your clients')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Form */}
          <div className="lg:col-span-2 space-y-4">
            {/* Service & Worker */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Scissors className="h-4 w-4 text-[#F05D5E]" />
                      {t('Servicio', 'Service')} *
                    </Label>
                    <Select value={selectedService} onValueChange={setSelectedService} data-testid="service-select">
                      <SelectTrigger data-testid="service-select-trigger">
                        <SelectValue placeholder={t('Selecciona servicio', 'Select service')} />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} - {formatCurrency(s.price)} ({s.duration_minutes} min)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <UserCog className="h-4 w-4 text-[#F05D5E]" />
                      {t('Profesional', 'Professional')}
                    </Label>
                    <Select value={selectedWorker} onValueChange={(v) => setSelectedWorker(v === 'any' ? '' : v)} data-testid="worker-select">
                      <SelectTrigger data-testid="worker-select-trigger">
                        <SelectValue placeholder={t('Cualquiera disponible', 'Any available')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">{t('Cualquiera disponible', 'Any available')}</SelectItem>
                        {workers.map(w => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Date & Time */}
            <Card>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Label className="flex items-center gap-2 text-sm font-medium mb-3">
                      <CalendarDays className="h-4 w-4 text-[#F05D5E]" />
                      {t('Fecha', 'Date')}
                    </Label>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => d && setSelectedDate(d)}
                      locale={language === 'es' ? es : enUS}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      className="rounded-lg border"
                      data-testid="reception-calendar"
                    />
                  </div>

                  <div>
                    <Label className="flex items-center gap-2 text-sm font-medium mb-3">
                      <Clock className="h-4 w-4 text-[#F05D5E]" />
                      {t('Horario disponible', 'Available time')}
                    </Label>
                    {!selectedService ? (
                      <p className="text-sm text-muted-foreground italic py-4">{t('Selecciona un servicio primero', 'Select a service first')}</p>
                    ) : slotsLoading ? (
                      <div className="flex items-center gap-2 py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">{t('Cargando horarios...', 'Loading times...')}</span>
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-4">{t('No hay horarios disponibles para esta fecha', 'No times available for this date')}</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1" data-testid="time-slots">
                        {slots.map(slot => (
                          <Button
                            key={slot.time}
                            size="sm"
                            variant={selectedTime === slot.time ? 'default' : 'outline'}
                            className={selectedTime === slot.time ? 'btn-coral' : ''}
                            onClick={() => setSelectedTime(slot.time)}
                            data-testid={`slot-${slot.time}`}
                          >
                            {slot.time}
                          </Button>
                        ))}
                      </div>
                    )}
                    {selectedTime && selectedServiceObj && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {selectedTime} - {(() => {
                          const [h, m] = selectedTime.split(':').map(Number);
                          const end = new Date(2000, 0, 1, h, m + selectedServiceObj.duration_minutes);
                          return format(end, 'HH:mm');
                        })()} ({selectedServiceObj.duration_minutes} min)
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Client Info */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <User className="h-4 w-4 text-[#F05D5E]" />
                  {t('Datos del cliente', 'Client information')}
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t('Nombre', 'Name')} *</Label>
                    <Input
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder={t('Nombre del cliente', 'Client name')}
                      data-testid="client-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t('Telefono', 'Phone')}</Label>
                    <Input
                      value={clientPhone}
                      onChange={e => setClientPhone(e.target.value)}
                      placeholder="+52 555 123 4567"
                      data-testid="client-phone-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t('Email', 'Email')}</Label>
                    <Input
                      type="email"
                      value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)}
                      placeholder="cliente@ejemplo.com"
                      data-testid="client-email-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t('Notas', 'Notes')}</Label>
                    <Input
                      value={clientNotes}
                      onChange={e => setClientNotes(e.target.value)}
                      placeholder={t('Notas adicionales...', 'Additional notes...')}
                      data-testid="client-notes-input"
                    />
                  </div>
                </div>

                <Separator />

                <Button
                  className="w-full btn-coral h-12 text-base"
                  disabled={!selectedService || !selectedTime || !clientName.trim() || submitting || success}
                  onClick={handleSubmit}
                  data-testid="create-booking-btn"
                >
                  {success ? (
                    <><CheckCircle2 className="h-5 w-5 mr-2" />{t('Cita registrada', 'Appointment booked')}</>
                  ) : submitting ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" />{t('Registrando...', 'Booking...')}</>
                  ) : (
                    t('Registrar cita', 'Book appointment')
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Today's schedule */}
          <div>
            <Card className="sticky top-24">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-[#F05D5E]" />
                  {t('Citas de hoy', 'Today\'s appointments')}
                  <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {todayBookings.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {todayBookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{t('No hay citas para hoy', 'No appointments today')}</p>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    {todayBookings
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map(booking => (
                        <div
                          key={booking.id}
                          className={`rounded-lg border p-3 text-sm space-y-1 ${
                            booking.status === 'completed' ? 'bg-green-50 dark:bg-green-900/10 border-green-200' :
                            booking.status === 'confirmed' ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200' :
                            'bg-muted/30'
                          }`}
                          data-testid={`today-booking-${booking.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs">
                              {booking.time} - {booking.end_time}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              booking.status === 'completed' ? 'bg-green-100 text-green-700' :
                              booking.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {booking.status === 'completed' ? t('Completada', 'Completed') :
                               booking.status === 'confirmed' ? t('Confirmada', 'Confirmed') :
                               t('Pendiente', 'Pending')}
                            </span>
                          </div>
                          <p className="font-medium text-xs">{booking.client_name || booking.user_name || t('Cliente', 'Client')}</p>
                          <p className="text-[11px] text-muted-foreground">{booking.service_name} - {booking.worker_name}</p>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
