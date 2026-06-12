import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useCountry } from '@/lib/countryContext';
import { useTheme } from '@/components/ThemeProvider';
import { BookviaLogo } from '@/components/BookviaLogo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Menu, X, Sun, Moon, Globe, User, Calendar, Heart, Bell, 
  LogOut, Building2, LayoutDashboard, ChevronDown, MapPin, Search,
  Settings, HelpCircle, FileText, CreditCard, BarChart3, Sparkles
} from 'lucide-react';
import { getInitials } from '@/lib/utils';
import { countries } from '@/lib/countries';
import { notificationsAPI } from '@/lib/api';
import { toast } from 'sonner';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [navNotifications, setNavNotifications] = useState([]);
  const [navUnreadCount, setNavUnreadCount] = useState(0);
  const [navNotifOpen, setNavNotifOpen] = useState(false);
  const { user, isAuthenticated, isAdmin, isBusiness, logout } = useAuth();
  const { t, language, toggleLanguage } = useI18n();
  const { country, setCountry } = useCountry();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Hero ahora tiene fondo claro, el navbar siempre en modo light
  const isTransparent = false;

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return countries;
    const q = countrySearch.toLowerCase();
    return countries.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  }, [countrySearch]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Load notifications for all authenticated users (clients, businesses, admins)
  const seenIdsRef = useRef(new Set());
  const initialisedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadNavNotifs = async () => {
      try {
        const [res, countRes] = await Promise.all([
          notificationsAPI.getAll(),
          notificationsAPI.getUnreadCount()
        ]);
        const list = Array.isArray(res.data) ? res.data : [];
        setNavNotifications(list);
        setNavUnreadCount(countRes.data?.count || 0);
        // Seed seen-set on first load so we don't toast pre-existing notifs
        seenIdsRef.current = new Set(list.map(n => n.id));
        initialisedRef.current = true;
      } catch { /* ignore: silent retry on next poll */ }
    };

    loadNavNotifs();

    const interval = setInterval(async () => {
      try {
        const res = await notificationsAPI.getAll();
        const list = Array.isArray(res.data) ? res.data : [];
        if (initialisedRef.current) {
          // Find brand-new unread notifications since last poll
          const fresh = list.filter(n => !n.read && !seenIdsRef.current.has(n.id));
          fresh.slice(0, 3).forEach(n => {
            toast(n.title || (language === 'es' ? 'Nueva notificación' : 'New notification'), {
              description: n.message,
              duration: 6000,
              action: {
                label: language === 'es' ? 'Ver' : 'View',
                onClick: () => handleNotifClick(n),
              },
            });
          });
        }
        seenIdsRef.current = new Set(list.map(n => n.id));
        setNavNotifications(list);
        const unread = list.filter(n => !n.read).length;
        setNavUnreadCount(unread);
        initialisedRef.current = true;
      } catch { /* ignore: silent retry on next poll */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, language]);

  // Close notification panel on outside click
  useEffect(() => {
    if (!navNotifOpen) return;
    const handler = (e) => {
      if (!e.target.closest('[data-testid="nav-notification-bell"]') && !e.target.closest('[data-testid="nav-notification-panel"]')) {
        setNavNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [navNotifOpen]);

  const handleNavMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNavNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setNavUnreadCount(0);
    } catch { /* ignore: state stays as-is */ }
  };

  const handleNavMarkRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNavNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setNavUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore: state stays as-is */ }
  };

  const handleNotifClick = async (n) => {
    if (!n.read) handleNavMarkRead(n.id);
    setNavNotifOpen(false);
    const data = n.data || {};
    // Smart routing per role + payload
    if (data.booking_id) {
      if (isBusiness) {
        navigate(`/business/dashboard?booking=${data.booking_id}`);
      } else {
        navigate(`/bookings`);
      }
      return;
    }
    if (data.business_id) {
      if (isAdmin) {
        navigate(`/bv-ctrl?business=${data.business_id}`);
      } else if (isBusiness) {
        navigate(`/business/dashboard`);
      }
      return;
    }
    // Fallback: open the corresponding dashboard
    if (isAdmin) navigate('/bv-ctrl');
    else if (isBusiness) navigate('/business/dashboard');
    else navigate('/dashboard');
  };

  return (
    <nav 
      data-testid="navbar"
      className={`fixed left-0 right-0 z-50 transition-all duration-300 ${
        isTransparent 
          ? 'bg-transparent' 
          : 'glass border-b border-border/50'
      }`}
      style={{ top: 'var(--beta-banner-h, 0px)' }}
    >
      <div className="container-app">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Left: Logo + Country + Center Links (all grouped) */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <BookviaLogo 
                variant={isTransparent ? 'dark' : 'light'} 
                size="text-2xl" 
                asLink 
              />
              {country && (
                <Popover open={countryOpen} onOpenChange={(open) => { setCountryOpen(open); if (!open) setCountrySearch(''); }}>
                  <PopoverTrigger asChild>
                    <button
                      className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all cursor-pointer hover:scale-105 ${
                        isTransparent
                          ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                          : 'border-border bg-muted/50 text-foreground hover:bg-muted'
                      }`}
                      data-testid="country-indicator"
                      title={language === 'es' ? 'Cambiar país' : 'Change country'}
                    >
                      <MapPin className="h-3 w-3 opacity-60" />
                    <span className="text-base leading-none">{country.flag}</span>
                    <span className="text-xs font-medium">{country.code}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0" sideOffset={8}>
                  <div className="p-3 border-b">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      {language === 'es' ? 'Explorar negocios en:' : 'Browse businesses in:'}
                    </p>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder={language === 'es' ? 'Buscar país...' : 'Search country...'}
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-sm rounded-md border bg-transparent outline-none focus:ring-1 focus:ring-ring"
                        data-testid="navbar-country-search"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {filteredCountries.map(c => (
                      <button
                        key={c.code}
                        onClick={() => { setCountry(c.code); setCountryOpen(false); setCountrySearch(''); }}
                        className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted transition-colors ${
                          c.code === country.code ? 'bg-muted font-medium' : ''
                        }`}
                        data-testid={`nav-country-${c.code}`}
                      >
                        <span className="text-lg leading-none">{c.flag}</span>
                        <span className="flex-1 text-left">{language === 'es' ? c.name : c.nameEn}</span>
                        {c.code === country.code && (
                          <span className="text-xs text-[#F05D5E] font-semibold">&#10003;</span>
                        )}
                      </button>
                    ))}
                    {filteredCountries.length === 0 && (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        {language === 'es' ? 'No se encontraron países' : 'No countries found'}
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            </div>

            {/* Center links - in the same flex group as logo+country */}
            <div className="hidden md:flex items-center gap-5 lg:gap-6 ml-2 lg:ml-4">
              <Link 
                to="/search" 
                className={`text-sm font-medium transition-colors hover:text-[#F05D5E] ${
                  isTransparent ? 'text-white/90' : 'text-foreground'
                }`}
                data-testid="nav-explore"
              >
                {language === 'es' ? 'Explorar' : 'Explore'}
              </Link>
              <Link 
                to="/beneficios" 
                className={`text-sm font-medium transition-colors hover:text-[#F05D5E] ${
                  isTransparent ? 'text-white/90' : 'text-foreground'
                }`}
                data-testid="nav-benefits"
              >
                {language === 'es' ? 'Beneficios' : 'Benefits'}
              </Link>
              <Link 
                to="/for-business" 
                className={`text-sm font-medium transition-colors hover:text-[#F05D5E] ${
                  isTransparent ? 'text-white/90' : 'text-foreground'
                }`}
                data-testid="nav-for-business"
              >
                {t('nav.forBusiness')}
              </Link>
            </div>
          </div>

          {/* Right Side */}
          <div className="hidden md:flex items-center gap-3">
            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLanguage}
              className={isTransparent ? 'text-white hover:bg-white/10' : ''}
              data-testid="language-toggle"
            >
              <Globe className="h-5 w-5" />
              <span className="sr-only">{language === 'es' ? 'English' : 'Español'}</span>
            </Button>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className={isTransparent ? 'text-white hover:bg-white/10' : ''}
              data-testid="theme-toggle"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            {isAuthenticated ? (
              <>
                {/* Notification Bell - visible for all authenticated roles */}
                <div className="relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`relative ${isTransparent ? 'text-white hover:bg-white/10' : ''}`}
                      onClick={async () => {
                        if (!navNotifOpen) {
                          try {
                            const [res, countRes] = await Promise.all([notificationsAPI.getAll(), notificationsAPI.getUnreadCount()]);
                            setNavNotifications(Array.isArray(res.data) ? res.data : []);
                            setNavUnreadCount(countRes.data?.count || 0);
                          } catch { /* ignore */ }
                        }
                        setNavNotifOpen(!navNotifOpen);
                      }}
                      data-testid="nav-notification-bell"
                    >
                      <Bell className="h-5 w-5" />
                      {navUnreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4.5 w-4.5 min-w-[18px] rounded-full bg-[#F05D5E] text-white text-[10px] font-bold flex items-center justify-center px-1" data-testid="nav-unread-count">
                          {navUnreadCount > 9 ? '9+' : navUnreadCount}
                        </span>
                      )}
                    </Button>
                    {navNotifOpen && (
                      <div className="absolute right-0 top-11 w-80 sm:w-96 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden" data-testid="nav-notification-panel">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                          <h3 className="text-sm font-semibold">{language === 'es' ? 'Notificaciones' : 'Notifications'}</h3>
                          {navUnreadCount > 0 && (
                            <button className="text-xs text-[#F05D5E] hover:underline" onClick={handleNavMarkAllRead} data-testid="nav-mark-all-read">
                              {language === 'es' ? 'Marcar todo como leido' : 'Mark all as read'}
                            </button>
                          )}
                        </div>
                        <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
                          {navNotifications.length === 0 ? (
                            <div className="py-10 text-center">
                              <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">{language === 'es' ? 'Sin notificaciones' : 'No notifications'}</p>
                            </div>
                          ) : navNotifications.map(n => (
                            <div
                              key={n.id}
                              className={`px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40 ${!n.read ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''}`}
                              onClick={() => handleNotifClick(n)}
                              data-testid={`nav-notif-item-${n.id}`}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className={`gap-2 ${isTransparent ? 'text-white hover:bg-white/10' : ''}`}
                    data-testid="user-menu-trigger"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.photo_url} />
                      <AvatarFallback className="bg-[#F05D5E] text-white text-xs">
                        {getInitials(user?.full_name || user?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60" data-testid="user-menu-content">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.full_name || user?.email}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  
                  {isAdmin && (
                    <>
                      <DropdownMenuItem onClick={() => navigate('/bv-ctrl')} data-testid="menu-admin">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Admin Panel
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  
                  {isBusiness && (
                    <>
                      <DropdownMenuItem onClick={() => navigate('/business/dashboard')} data-testid="menu-business-dashboard">
                        <Building2 className="mr-2 h-4 w-4" />
                        {language === 'es' ? 'Panel de negocio' : 'Business panel'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/business/settings')} data-testid="menu-business-settings">
                        <Settings className="mr-2 h-4 w-4" />
                        {language === 'es' ? 'Configuracion del negocio' : 'Business settings'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/business/dashboard?tab=subscription')} data-testid="menu-business-billing">
                        <CreditCard className="mr-2 h-4 w-4" />
                        {language === 'es' ? 'Suscripcion y facturacion' : 'Subscription & billing'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/business/dashboard?tab=reports')} data-testid="menu-business-reports">
                        <BarChart3 className="mr-2 h-4 w-4" />
                        {language === 'es' ? 'Reportes' : 'Reports'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  
                  {!isBusiness && !isAdmin && (
                    <>
                      <DropdownMenuItem onClick={() => navigate('/dashboard')} data-testid="menu-dashboard">
                        <User className="mr-2 h-4 w-4" />
                        {language === 'es' ? 'Mi perfil' : 'My profile'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/bookings')} data-testid="menu-bookings">
                        <Calendar className="mr-2 h-4 w-4" />
                        {language === 'es' ? 'Mis citas' : 'My bookings'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/favorites')} data-testid="menu-favorites">
                        <Heart className="mr-2 h-4 w-4" />
                        {language === 'es' ? 'Favoritos' : 'Favorites'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/payment-history')} data-testid="menu-payment-history">
                        <CreditCard className="mr-2 h-4 w-4" />
                        {language === 'es' ? 'Historial de pagos' : 'Payment history'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/dashboard?tab=notifications')} data-testid="menu-notification-prefs">
                        <Bell className="mr-2 h-4 w-4" />
                        {language === 'es' ? 'Preferencias de avisos' : 'Notification preferences'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {/* Common to all roles */}
                  <DropdownMenuItem onClick={() => { toggleTheme(); }} data-testid="menu-theme">
                    {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                    {language === 'es' ? (theme === 'dark' ? 'Modo claro' : 'Modo oscuro') : (theme === 'dark' ? 'Light mode' : 'Dark mode')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleLanguage()} data-testid="menu-language">
                    <Globe className="mr-2 h-4 w-4" />
                    {language === 'es' ? 'English' : 'Español'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/ayuda')} data-testid="menu-help">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    {language === 'es' ? 'Ayuda y soporte' : 'Help & support'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/legal')} data-testid="menu-terms">
                    <FileText className="mr-2 h-4 w-4" />
                    {language === 'es' ? 'Terminos y privacidad' : 'Terms & privacy'}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600" data-testid="menu-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    {language === 'es' ? 'Cerrar sesion' : 'Logout'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => navigate('/login')}
                  className={isTransparent ? 'text-white hover:bg-white/10' : ''}
                  data-testid="login-button"
                >
                  {t('nav.login')}
                </Button>
                <Button
                  onClick={() => navigate('/register')}
                  className="btn-coral"
                  data-testid="register-button"
                >
                  {t('nav.register')}
                </Button>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className={`md:hidden ${isTransparent ? 'text-white' : ''}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="mobile-menu-button"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border/50 glass rounded-b-xl" data-testid="mobile-menu">
            <div className="flex flex-col gap-2">
              <Link
                to="/search"
                className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                {language === 'es' ? 'Explorar' : 'Explore'}
              </Link>
              <Link
                to="/beneficios"
                className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                {language === 'es' ? 'Beneficios' : 'Benefits'}
              </Link>
              <Link
                to="/for-business"
                className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('nav.forBusiness')}
              </Link>
              
              <div className="border-t border-border/50 my-2" />
              
              <div className="flex items-center gap-2 px-4">
                {country && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted/50 text-foreground hover:bg-muted mr-1">
                        <MapPin className="h-3 w-3 opacity-60" />
                        <span className="text-base leading-none">{country.flag}</span>
                        <span className="text-xs font-medium">{country.code}</span>
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-0" sideOffset={8}>
                      <div className="p-3 border-b">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          {language === 'es' ? 'Explorar negocios en:' : 'Browse businesses in:'}
                        </p>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder={language === 'es' ? 'Buscar país...' : 'Search country...'}
                            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border bg-transparent outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-52 overflow-y-auto py-1">
                        {countries.map(c => (
                          <button
                            key={c.code}
                            onClick={() => { setCountry(c.code); setMobileMenuOpen(false); }}
                            className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted transition-colors ${
                              c.code === country.code ? 'bg-muted font-medium' : ''
                            }`}
                          >
                            <span className="text-lg leading-none">{c.flag}</span>
                            <span className="flex-1 text-left">{language === 'es' ? c.name : c.nameEn}</span>
                            {c.code === country.code && (
                              <span className="text-xs text-[#F05D5E] font-semibold">&#10003;</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <Button variant="ghost" size="icon" onClick={toggleLanguage}>
                  <Globe className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>
              </div>

              {isAuthenticated ? (
                <>
                  <div className="border-t border-border/50 my-2" />
                  {!isBusiness && !isAdmin && (
                    <>
                      <Link
                        to="/bookings"
                        className="px-4 py-2.5 text-sm font-medium hover:bg-muted rounded-lg flex items-center gap-2"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Calendar className="h-4 w-4 text-[#F05D5E]" />
                        {t('nav.bookings')}
                      </Link>
                      <Link
                        to="/favorites"
                        className="px-4 py-2.5 text-sm font-medium hover:bg-muted rounded-lg flex items-center gap-2"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Heart className="h-4 w-4 text-[#F05D5E]" />
                        {t('nav.favorites')}
                      </Link>
                      <button
                        className="px-4 py-2.5 text-sm font-medium hover:bg-muted rounded-lg flex items-center gap-2 w-full text-left"
                        onClick={() => { setMobileMenuOpen(false); setNavNotifOpen(!navNotifOpen); }}
                        data-testid="mobile-notification-toggle"
                      >
                        <Bell className="h-4 w-4 text-[#F05D5E]" />
                        {language === 'es' ? 'Notificaciones' : 'Notifications'}
                        {navUnreadCount > 0 && (
                          <Badge className="ml-auto bg-[#F05D5E] text-white text-[10px] h-5 px-1.5">{navUnreadCount}</Badge>
                        )}
                      </button>
                    </>
                  )}
                  {(isBusiness || isAdmin) && (
                    <button
                      className="px-4 py-2.5 text-sm font-medium hover:bg-muted rounded-lg flex items-center gap-2 w-full text-left"
                      onClick={() => { setMobileMenuOpen(false); setNavNotifOpen(!navNotifOpen); }}
                      data-testid="mobile-notification-toggle"
                    >
                      <Bell className="h-4 w-4 text-[#F05D5E]" />
                      {language === 'es' ? 'Notificaciones' : 'Notifications'}
                      {navUnreadCount > 0 && (
                        <Badge className="ml-auto bg-[#F05D5E] text-white text-[10px] h-5 px-1.5">{navUnreadCount}</Badge>
                      )}
                    </button>
                  )}
                  <Link
                    to={isBusiness ? '/business/dashboard' : '/dashboard'}
                    className="px-4 py-2.5 text-sm font-medium hover:bg-muted rounded-lg flex items-center gap-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <LayoutDashboard className="h-4 w-4 text-[#F05D5E]" />
                    {t('nav.dashboard')}
                  </Link>
                  <button
                    onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                    className="px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-muted rounded-lg text-left flex items-center gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    {t('nav.logout')}
                  </button>
                </>
              ) : (
                <>
                  <div className="border-t border-border/50 my-2" />
                  <div className="flex gap-2 px-4">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => { navigate('/login'); setMobileMenuOpen(false); }}
                    >
                      {t('nav.login')}
                    </Button>
                    <Button
                      className="flex-1 btn-coral"
                      onClick={() => { navigate('/register'); setMobileMenuOpen(false); }}
                    >
                      {t('nav.register')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
