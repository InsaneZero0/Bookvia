import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import WalletCard from '@/components/WalletCard';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { usersAPI, bookingsAPI } from '@/lib/api';
import { getInitials, formatTime, formatCurrency, getStatusColor } from '@/lib/utils';
import { toast } from 'sonner';
import {
  User, Mail, Phone, Calendar, Heart, Shield, Camera, Edit2, Check, X,
  Clock, ChevronRight, Star, Search, MapPin, ArrowUpRight, Bookmark,
  CalendarDays, CreditCard, Bell, MessageSquare, Download, FileJson,
  Pencil, Trash2, BellOff, AlertTriangle, Copy
} from 'lucide-react';

export default function UserDashboardPage() {
  const { t, language } = useI18n();
  const { user, isAuthenticated, updateUser, refreshUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ full_name: '', phone: '', birth_date: '', gender: '' });
  const [saving, setSaving] = useState(false);
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [marketingOptOut, setMarketingOptOut] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false });
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleExportData = async () => {
    if (exportingData) return;
    setExportingData(true);
    try {
      const res = await usersAPI.exportMyData();
      const blob = new Blob([res.data], { type: 'application/json;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `bookvia-mis-datos-${stamp}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(language === 'es'
        ? 'Tus datos personales fueron descargados'
        : 'Your personal data has been downloaded');
    } catch (e) {
      toast.error(e?.response?.data?.detail || (language === 'es' ? 'No se pudo exportar' : 'Could not export'));
    } finally {
      setExportingData(false);
    }
  };

  const handleToggleMarketing = async (optOut) => {
    setSavingMarketing(true);
    try {
      await usersAPI.setMarketingOptOut(optOut);
      setMarketingOptOut(optOut);
      toast.success(language === 'es'
        ? (optOut ? 'Preferencia guardada: te opusiste al marketing' : 'Preferencia actualizada')
        : (optOut ? 'Preference saved: you opted out of marketing' : 'Preference updated'));
    } catch {
      toast.error(language === 'es' ? 'Error al guardar' : 'Error saving');
    } finally {
      setSavingMarketing(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deletingAccount) return;
    if ((deleteConfirm || '').trim().toUpperCase() !== 'ELIMINAR') {
      toast.error(language === 'es' ? 'Escribe ELIMINAR para confirmar' : 'Type ELIMINAR to confirm');
      return;
    }
    if (!deletePassword) {
      toast.error(language === 'es' ? 'Ingresa tu contrasena' : 'Enter your password');
      return;
    }
    setDeletingAccount(true);
    try {
      await usersAPI.deleteAccount(deletePassword, deleteConfirm.trim().toUpperCase());
      toast.success(language === 'es' ? 'Cuenta eliminada' : 'Account deleted');
      setDeleteDialog({ open: false });
      setDeletePassword('');
      setDeleteConfirm('');
      try { localStorage.clear(); } catch { /* ignore */ }
      setTimeout(() => { window.location.href = '/'; }, 600);
    } catch (e) {
      toast.error(e?.response?.data?.detail || (language === 'es' ? 'Error al eliminar' : 'Error deleting'));
    } finally {
      setDeletingAccount(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate('/login'); return; }
    loadData();
  }, [isAuthenticated, authLoading]);

  const loadData = async () => {
    try {
      const [userData, bookingsRes, favsRes, statsRes] = await Promise.all([
        refreshUser(),
        bookingsAPI.getMy({ upcoming: true }).catch(() => ({ data: [] })),
        usersAPI.getFavorites().catch(() => ({ data: [] })),
        usersAPI.getMyStats().catch(() => ({ data: null })),
      ]);
      setFormData({
        full_name: userData.full_name || '',
        phone: userData.phone || '',
        birth_date: userData.birth_date || '',
        gender: userData.gender || '',
      });
      setUpcomingBookings(Array.isArray(bookingsRes.data) ? bookingsRes.data.slice(0, 3) : []);
      setFavorites(Array.isArray(favsRes.data) ? favsRes.data.slice(0, 4) : []);
      setUserStats(statsRes?.data || null);
      setMarketingOptOut(!!userData.marketing_opt_out);
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await usersAPI.updateProfile(formData);
      updateUser(res.data);
      setEditing(false);
      toast.success(language === 'es' ? 'Perfil actualizado' : 'Profile updated');
    } catch {
      toast.error(language === 'es' ? 'Error al actualizar' : 'Error updating');
    } finally {
      setSaving(false);
    }
  };

  const togglePref = async (field, nextValue) => {
    setSavingPrefs(true);
    try {
      const res = await usersAPI.updateProfile({ [field]: nextValue });
      updateUser(res.data);
      toast.success(language === 'es' ? 'Preferencias actualizadas' : 'Preferences updated');
    } catch {
      toast.error(language === 'es' ? 'Error al actualizar' : 'Error updating');
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <div className="flex items-center gap-4 mb-8">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-24" /></div>
          </div>
          <div className="grid md:grid-cols-4 gap-3 mb-8">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="user-dashboard-page">
      <div className="container-app py-8">

        {/* ── Profile Header ─────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="relative">
            <Avatar className="h-18 w-18 border-3 border-background shadow-xl" style={{ height: '72px', width: '72px' }}>
              <AvatarImage src={user?.photo_url} />
              <AvatarFallback className="text-2xl bg-[#F05D5E] text-white font-bold">
                {getInitials(user?.full_name)}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-heading font-bold">{user?.full_name}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <div className="flex items-center flex-wrap gap-2 mt-1.5">
              {user?.public_code && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(user.public_code);
                    toast.success(language === 'es' ? 'Código copiado' : 'Code copied');
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#F05D5E]/10 to-amber-50 border border-[#F05D5E]/30 hover:border-[#F05D5E] transition-colors group"
                  title={language === 'es' ? 'Click para copiar tu ID Bookvia' : 'Click to copy your Bookvia ID'}
                  data-testid="user-public-code-badge"
                >
                  <span className="text-[10px] uppercase tracking-wider text-[#F05D5E]/70 font-semibold">
                    {language === 'es' ? 'Tu ID' : 'Your ID'}
                  </span>
                  <span className="font-mono font-bold text-sm text-[#F05D5E]">{user.public_code}</span>
                  <Copy className="h-3 w-3 text-[#F05D5E]/60 group-hover:text-[#F05D5E]" />
                </button>
              )}
              {user?.phone_verified ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                  <Shield className="h-3 w-3 mr-1" />{language === 'es' ? 'Verificado' : 'Verified'}
                </Badge>
              ) : (
                <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => navigate('/verify-phone')}>
                  {language === 'es' ? 'Verificar teléfono' : 'Verify phone'}
                </Button>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing(true)} data-testid="edit-profile-button">
            <Edit2 className="h-4 w-4 mr-1.5" />{language === 'es' ? 'Editar perfil' : 'Edit profile'}
          </Button>
        </div>

        {/* ── Wallet Card ────────────────────────────── */}
        <div className="mb-6">
          <WalletCard />
        </div>

        {/* ── Quick Actions ──────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { icon: CalendarDays, label: language === 'es' ? 'Mis citas' : 'My bookings', path: '/bookings', color: 'text-blue-500 bg-blue-50', count: user?.active_appointments_count || 0 },
            { icon: Heart, label: t('nav.favorites'), path: '/favorites', color: 'text-rose-500 bg-rose-50', count: user?.favorites?.length || 0 },
            { icon: CreditCard, label: language === 'es' ? 'Mis pagos' : 'My payments', path: '/payments', color: 'text-emerald-500 bg-emerald-50' },
            { icon: Search, label: language === 'es' ? 'Buscar' : 'Search', path: '/search', color: 'text-violet-500 bg-violet-50' },
            { icon: Bell, label: language === 'es' ? 'Notificaciones' : 'Notifications', path: '/notifications', color: 'text-amber-500 bg-amber-50' },
          ].map(item => (
            <Card
              key={item.path}
              className="cursor-pointer hover:border-[#F05D5E]/30 hover:shadow-sm transition-all group"
              onClick={() => navigate(item.path)}
              data-testid={`quick-action-${item.path.replace('/', '')}`}
            >
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className={`p-2 rounded-xl ${item.color} group-hover:scale-110 transition-transform`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  {item.count > 0 && <p className="text-xs text-muted-foreground">{item.count}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Stats Summary ──────────────────────────── */}
        {userStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-testid="user-stats-section">
            <Card>
              <CardContent className="p-3.5 text-center">
                <p className="text-2xl font-bold text-[#F05D5E]">{userStats.total_bookings}</p>
                <p className="text-xs text-muted-foreground">{language === 'es' ? 'Total reservas' : 'Total bookings'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5 text-center">
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(userStats.total_spent)}</p>
                <p className="text-xs text-muted-foreground">{language === 'es' ? 'Total gastado' : 'Total spent'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5 text-center">
                <p className="text-2xl font-bold text-blue-600">{userStats.upcoming}</p>
                <p className="text-xs text-muted-foreground">{language === 'es' ? 'Citas pendientes' : 'Upcoming'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <p className="text-2xl font-bold">{userStats.avg_rating_given || '-'}</p>
                </div>
                <p className="text-xs text-muted-foreground">{userStats.reviews_given} {language === 'es' ? 'resenas dadas' : 'reviews given'}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Rebook Suggestions ──────────────────────── */}
        {userStats?.recent_completed?.length > 0 && (
          <Card className="mb-6" data-testid="rebook-section">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading">
                {language === 'es' ? 'Reservar de nuevo' : 'Book again'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {userStats.recent_completed.map(b => (
                  <Card key={b.id} className="shrink-0 w-52 cursor-pointer hover:border-[#F05D5E]/30 transition-all"
                    onClick={() => navigate(`/business/${b.business_id}`)} data-testid={`rebook-${b.id}`}>
                    <CardContent className="p-3">
                      <p className="text-sm font-medium truncate">{b.service_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.business_name}</p>
                      <p className="text-xs text-muted-foreground">{b.worker_name}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* ── Left Column: Upcoming Bookings ─────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Upcoming Bookings */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-heading">
                  {language === 'es' ? 'Próximas citas' : 'Upcoming appointments'}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate('/bookings')} className="text-[#F05D5E] hover:text-[#D94A4B]">
                  {language === 'es' ? 'Ver todas' : 'View all'} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent>
                {upcomingBookings.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingBookings.map(booking => (
                      <div key={booking.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:border-[#F05D5E]/20 transition-colors" data-testid={`upcoming-booking-${booking.id}`}>
                        <div className="w-14 h-14 rounded-xl bg-[#F05D5E]/5 flex flex-col items-center justify-center shrink-0">
                          <span className="text-[10px] text-[#F05D5E] uppercase font-medium">
                            {new Date(booking.date + 'T12:00:00').toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { month: 'short' })}
                          </span>
                          <span className="text-lg font-bold text-[#F05D5E]">{new Date(booking.date + 'T12:00:00').getDate()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{booking.service_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{booking.business_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />{formatTime(booking.time)}
                            </span>
                            {booking.worker_name && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <User className="h-3 w-3" />{booking.worker_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge className={`text-[10px] shrink-0 ${getStatusColor(booking.status)}`}>
                          {t(`status.${booking.status}`)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">{language === 'es' ? 'No tienes citas próximas' : 'No upcoming appointments'}</p>
                    <Button size="sm" className="btn-coral" onClick={() => navigate('/search')}>
                      <Search className="h-4 w-4 mr-1.5" />{language === 'es' ? 'Explorar negocios' : 'Explore businesses'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Favorites */}
            {favorites.length > 0 && (
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-heading">
                    {language === 'es' ? 'Tus favoritos' : 'Your favorites'}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/favorites')} className="text-[#F05D5E] hover:text-[#D94A4B]">
                    {language === 'es' ? 'Ver todos' : 'View all'} <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {favorites.map(biz => (
                      <div
                        key={biz.id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:border-[#F05D5E]/20 transition-colors cursor-pointer"
                        onClick={() => navigate(`/business/${biz.slug}`)}
                        data-testid={`favorite-biz-${biz.id}`}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={biz.photos?.[0]} />
                          <AvatarFallback className="bg-[#F05D5E]/10 text-[#F05D5E] text-sm font-bold">
                            {getInitials(biz.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{biz.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {biz.rating > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{biz.rating.toFixed(1)}
                              </span>
                            )}
                            <span className="flex items-center gap-0.5 truncate">
                              <MapPin className="h-3 w-3" />{biz.city}
                            </span>
                          </div>
                        </div>
                        <Heart className="h-4 w-4 fill-[#F05D5E] text-[#F05D5E] shrink-0" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right Column: Profile Info ────────── */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-heading">{language === 'es' ? 'Mi información' : 'My information'}</CardTitle>
                {editing && (
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" className="h-7 btn-coral" onClick={handleSave} disabled={saving} data-testid="save-profile-button">
                      <Check className="h-3.5 w-3.5 mr-1" />{language === 'es' ? 'Guardar' : 'Save'}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { icon: User, label: t('auth.fullName'), field: 'full_name', value: user?.full_name },
                  { icon: Mail, label: t('auth.email'), value: user?.email, readOnly: true },
                  { icon: Phone, label: t('auth.phone'), field: 'phone', value: user?.phone },
                  { icon: Calendar, label: t('auth.birthDate'), field: 'birth_date', value: user?.birth_date, type: 'date' },
                ].map(item => (
                  <div key={item.label} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <item.icon className="h-3.5 w-3.5" />{item.label}
                    </label>
                    {editing && !item.readOnly ? (
                      <Input
                        type={item.type || 'text'}
                        value={formData[item.field] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [item.field]: e.target.value }))}
                        className="h-8 text-sm"
                        data-testid={`edit-${item.field}`}
                      />
                    ) : (
                      <p className="text-sm">{item.value || '—'}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { value: user?.active_appointments_count || 0, label: language === 'es' ? 'Activas' : 'Active' },
                    { value: user?.cancellation_count || 0, label: language === 'es' ? 'Canceladas' : 'Cancelled' },
                    { value: user?.favorites?.length || 0, label: language === 'es' ? 'Favoritos' : 'Favorites' },
                  ].map(stat => (
                    <div key={stat.label}>
                      <p className="text-xl font-bold text-[#F05D5E]">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Notification Preferences */}
            <Card data-testid="notification-prefs-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <Bell className="h-4 w-4 text-[#F05D5E]" />
                  {language === 'es' ? 'Mis notificaciones' : 'My notifications'}
                </CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  {language === 'es'
                    ? 'Elige cómo quieres que te avisemos cuando reserves, te confirmen o cancelen una cita, y cuando se acerque tu próxima visita.'
                    : 'Choose how we should notify you when you book, get a confirmation or cancellation, and when your next visit is coming up.'}
                </p>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {/* Email toggle */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded-lg bg-[#F05D5E]/10 flex items-center justify-center shrink-0">
                      <Mail className="h-4 w-4 text-[#F05D5E]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{language === 'es' ? 'Correo electrónico' : 'Email'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {language === 'es' ? 'Detalles completos de cada cita' : 'Full appointment details'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={user?.notify_email !== false}
                    disabled={savingPrefs}
                    onCheckedChange={(v) => togglePref('notify_email', v)}
                    data-testid="notify-email-toggle"
                  />
                </div>

                {/* SMS toggle */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded-lg bg-[#F05D5E]/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 text-[#F05D5E]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{language === 'es' ? 'SMS al celular' : 'SMS to mobile'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user?.phone || (language === 'es' ? 'Sin número' : 'No number')}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {language === 'es' ? 'Avisos rápidos y recordatorios' : 'Quick alerts and reminders'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={user?.notify_sms !== false}
                    disabled={savingPrefs || !user?.phone}
                    onCheckedChange={(v) => togglePref('notify_sms', v)}
                    data-testid="notify-sms-toggle"
                  />
                </div>

                {/* Info note */}
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    {language === 'es'
                      ? 'Te recomendamos mantener al menos uno activo para no perderte tus citas. No te enviaremos publicidad.'
                      : 'We recommend keeping at least one enabled so you don\'t miss your appointments. We won\'t send ads.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Privacy & Personal Data (LFPDPPP Derechos ARCO) */}
            <Card data-testid="privacy-data-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[#F05D5E]" />
                  {language === 'es' ? 'Privacidad y mis datos (ARCO)' : 'Privacy & my data (ARCO)'}
                </CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  {language === 'es'
                    ? 'Ejerce tus derechos ARCO bajo la LFPDPPP: Acceso, Rectificacion, Cancelacion y Oposicion.'
                    : 'Exercise your ARCO rights under LFPDPPP: Access, Rectification, Cancellation, Opposition.'}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {/* A: Acceso */}
                <div className="rounded-lg border p-3 bg-slate-50/50 dark:bg-slate-900/30">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    A - {language === 'es' ? 'Acceso' : 'Access'}
                  </p>
                  <Button
                    className="w-full justify-start h-10 gap-2"
                    variant="outline"
                    onClick={handleExportData}
                    disabled={exportingData}
                    data-testid="export-data-btn"
                  >
                    {exportingData ? (
                      <>
                        <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        {language === 'es' ? 'Preparando...' : 'Preparing...'}
                      </>
                    ) : (
                      <>
                        <FileJson className="h-4 w-4 text-[#F05D5E]" />
                        <span className="text-sm">{language === 'es' ? 'Descargar mis datos' : 'Download my data'}</span>
                        <Download className="h-4 w-4 ml-auto text-muted-foreground" />
                      </>
                    )}
                  </Button>
                </div>

                {/* R: Rectificacion */}
                <div className="rounded-lg border p-3 bg-slate-50/50 dark:bg-slate-900/30">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    R - {language === 'es' ? 'Rectificacion' : 'Rectification'}
                  </p>
                  <Button
                    className="w-full justify-start h-10 gap-2"
                    variant="outline"
                    onClick={() => setEditing(true)}
                    data-testid="rectify-profile-btn"
                  >
                    <Pencil className="h-4 w-4 text-[#F05D5E]" />
                    <span className="text-sm">{language === 'es' ? 'Editar mi perfil' : 'Edit my profile'}</span>
                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                  </Button>
                </div>

                {/* O: Oposicion */}
                <div className="rounded-lg border p-3 bg-slate-50/50 dark:bg-slate-900/30">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    O - {language === 'es' ? 'Oposicion a marketing' : 'Marketing opposition'}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-none">
                        {language === 'es' ? 'No recibir publicidad' : 'No marketing'}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        {language === 'es'
                          ? 'Bookvia hoy no envia publicidad. Marcar esta opcion registra tu oposicion para cualquier campana futura.'
                          : 'Bookvia does not send marketing today. Enabling this logs your opposition against any future campaign.'}
                      </p>
                    </div>
                    <Switch
                      checked={marketingOptOut}
                      disabled={savingMarketing}
                      onCheckedChange={handleToggleMarketing}
                      data-testid="marketing-opt-out-switch"
                    />
                  </div>
                </div>

                {/* C: Cancelacion */}
                <div className="rounded-lg border border-red-200 p-3 bg-red-50/50 dark:bg-red-900/10 dark:border-red-900/30">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">
                    C - {language === 'es' ? 'Cancelacion (eliminar cuenta)' : 'Cancellation (delete account)'}
                  </p>
                  <Button
                    className="w-full justify-start h-10 gap-2 text-red-700 border-red-300 hover:bg-red-50 hover:text-red-800"
                    variant="outline"
                    onClick={() => setDeleteDialog({ open: true })}
                    data-testid="delete-account-btn"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="text-sm">{language === 'es' ? 'Eliminar mi cuenta' : 'Delete my account'}</span>
                  </Button>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
                    {language === 'es'
                      ? 'Tus datos personales seran redactados. Los registros contables (pagos, citas completadas) se conservan por obligacion fiscal.'
                      : 'Your personal data will be redacted. Accounting records (payments, completed bookings) are kept for tax compliance.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete account confirmation dialog (ARCO-C) */}
      <Dialog open={deleteDialog.open} onOpenChange={(v) => { if (!deletingAccount) { setDeleteDialog({ open: v }); if (!v) { setDeletePassword(''); setDeleteConfirm(''); } } }}>
        <DialogContent className="max-w-md" data-testid="delete-account-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              {language === 'es' ? 'Eliminar mi cuenta' : 'Delete my account'}
            </DialogTitle>
            <DialogDescription className="text-xs pt-2 leading-relaxed">
              {language === 'es'
                ? 'Esta accion es irreversible. Tus datos personales seran redactados y ya no podras iniciar sesion. Los pagos y citas completadas se conservan por obligacion fiscal.'
                : 'This action is irreversible. Your personal data will be redacted and you will no longer be able to log in. Payments and completed bookings are kept for tax compliance.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-[11px] text-amber-900 leading-relaxed">
                {language === 'es'
                  ? 'Antes de eliminar: asegurate de no tener citas activas ni saldo en tu wallet (si tienes saldo, no sera recuperado).'
                  : 'Before deleting: ensure you have no active bookings or wallet balance (balance cannot be recovered).'}
              </p>
            </div>

            <div>
              <Label htmlFor="delete-password" className="text-xs">
                {language === 'es' ? 'Contrasena actual' : 'Current password'}
              </Label>
              <Input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                disabled={deletingAccount}
                autoComplete="current-password"
                data-testid="delete-password-input"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="delete-confirm" className="text-xs">
                {language === 'es' ? 'Escribe ELIMINAR para confirmar' : 'Type ELIMINAR to confirm'}
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                disabled={deletingAccount}
                placeholder="ELIMINAR"
                data-testid="delete-confirm-input"
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => { setDeleteDialog({ open: false }); setDeletePassword(''); setDeleteConfirm(''); }}
              disabled={deletingAccount}
              data-testid="delete-cancel-btn"
            >
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteAccount}
              disabled={deletingAccount || !deletePassword || (deleteConfirm || '').trim().toUpperCase() !== 'ELIMINAR'}
              data-testid="delete-confirm-btn"
            >
              {deletingAccount ? (language === 'es' ? 'Eliminando...' : 'Deleting...') : (language === 'es' ? 'Eliminar definitivamente' : 'Delete permanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
