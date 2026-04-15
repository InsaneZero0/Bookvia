import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { CountryProvider } from '@/lib/countryContext';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

// Pages
import HomePage from '@/pages/HomePage';
import SearchPage from '@/pages/SearchPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import BusinessRegisterPage from '@/pages/BusinessRegisterPage';
import SubscriptionSuccessPage from '@/pages/SubscriptionSuccessPage';
import BusinessProfilePage from '@/pages/BusinessProfilePage';
import UserDashboardPage from '@/pages/UserDashboardPage';
import UserBookingsPage from '@/pages/UserBookingsPage';
import BusinessDashboardPage from '@/pages/BusinessDashboardPage';
import ReceptionPage from '@/pages/ReceptionPage';
import BusinessFinancePage from '@/pages/BusinessFinancePage';
import TeamSchedulePage from '@/pages/TeamSchedulePage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import ServiceManagementPage from '@/pages/ServiceManagementPage';
import BusinessSettingsPage from '@/pages/BusinessSettingsPage';
import PaymentSuccessPage from '@/pages/PaymentSuccessPage';
import PaymentCancelPage from '@/pages/PaymentCancelPage';
import HelpPage from '@/pages/HelpPage';
import TermsPage from '@/pages/TermsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import AboutPage from '@/pages/AboutPage';
import NotFoundPage from '@/pages/NotFoundPage';
import RegistrationSuccessPage from '@/pages/RegistrationSuccessPage';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import FavoritesPage from '@/pages/FavoritesPage';
import PaymentHistoryPage from '@/pages/PaymentHistoryPage';
import GoogleAuthCallback from '@/pages/GoogleAuthCallback';

// SEO Pages
import CountryPage from '@/pages/seo/CountryPage';
import CityPage from '@/pages/seo/CityPage';
import CategoryPage from '@/pages/seo/CategoryPage';
import BusinessSEOPage from '@/pages/seo/BusinessSEOPage';

// Layout wrapper
function Layout({ children, showFooter = true }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{children}</main>
      {showFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="bookvia-theme">
      <I18nProvider>
        <AuthProvider>
          <CountryProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Pages */}
              <Route path="/" element={<Layout><HomePage /></Layout>} />
              <Route path="/search" element={<Layout><SearchPage /></Layout>} />
              <Route path="/categories" element={<Layout><SearchPage /></Layout>} />
              
              {/* Auth Pages */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/registration-success" element={<RegistrationSuccessPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth/google/callback" element={<GoogleAuthCallback />} />
              
              {/* User Pages */}
              <Route path="/dashboard" element={<Layout><UserDashboardPage /></Layout>} />
              <Route path="/dashboard/bookings" element={<Layout><UserBookingsPage /></Layout>} />
              <Route path="/bookings" element={<Layout><UserBookingsPage /></Layout>} />
              <Route path="/favorites" element={<Layout><FavoritesPage /></Layout>} />
              <Route path="/payments" element={<Layout><PaymentHistoryPage /></Layout>} />
              <Route path="/notifications" element={<Layout><UserDashboardPage /></Layout>} />
              
              {/* Business Pages - MUST be before /business/:slug */}
              <Route path="/business/dashboard" element={<Layout showFooter={false}><BusinessDashboardPage /></Layout>} />
              <Route path="/business/reception" element={<Layout showFooter={false}><ReceptionPage /></Layout>} />
              <Route path="/business/finance" element={<Layout showFooter={false}><BusinessFinancePage /></Layout>} />
              <Route path="/business/team" element={<Layout showFooter={false}><TeamSchedulePage /></Layout>} />
              <Route path="/business/services" element={<Layout showFooter={false}><ServiceManagementPage /></Layout>} />
              <Route path="/business/settings" element={<Layout showFooter={false}><BusinessSettingsPage /></Layout>} />
              <Route path="/business/login" element={<LoginPage />} />
              <Route path="/business/register" element={<BusinessRegisterPage />} />
              <Route path="/business/subscription/success" element={<Layout showFooter={false}><SubscriptionSuccessPage /></Layout>} />
              <Route path="/for-business" element={<Layout><ForBusinessPage /></Layout>} />
              {/* Business Profile Page - dynamic slug MUST be last */}
              <Route path="/business/:slug" element={<Layout><BusinessProfilePage /></Layout>} />
              
              {/* Payment Pages */}
              <Route path="/payment/success" element={<Layout><PaymentSuccessPage /></Layout>} />
              <Route path="/payment/cancel" element={<Layout><PaymentCancelPage /></Layout>} />
              
              {/* Help Page */}
              <Route path="/ayuda" element={<Layout><HelpPage /></Layout>} />
              <Route path="/help" element={<Layout><HelpPage /></Layout>} />
              
              {/* Legal Pages */}
              <Route path="/terminos" element={<Layout><TermsPage /></Layout>} />
              <Route path="/terms" element={<Layout><TermsPage /></Layout>} />
              <Route path="/privacidad" element={<Layout><PrivacyPage /></Layout>} />
              <Route path="/privacy" element={<Layout><PrivacyPage /></Layout>} />
              <Route path="/nosotros" element={<Layout><AboutPage /></Layout>} />
              <Route path="/about" element={<Layout><AboutPage /></Layout>} />
              
              {/* Admin Pages - MUST be before dynamic SEO routes */}
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin" element={<Layout showFooter={false}><AdminDashboardPage /></Layout>} />
              {/* Catch-all for any undefined admin sub-routes */}
              <Route path="/admin/*" element={<AdminLoginPage />} />
              
              {/* SEO Pages - Dynamic country/city/category routes */}
              {/* Order matters: more specific routes first */}
              <Route path="/:country/:city/:slugOrCategory" element={<SEORouter />} />
              <Route path="/:country/:city" element={<Layout><CityPage /></Layout>} />
              <Route path="/:country" element={<Layout><CountryPage /></Layout>} />
              
              {/* Catch all */}
              <Route path="*" element={<Layout><NotFoundPage /></Layout>} />
            </Routes>
            <Toaster position="top-center" richColors />
          </BrowserRouter>
          </CountryProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

// SEO Router - Determines if slugOrCategory is a category or business slug
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { categoriesAPI } from '@/lib/api';

// Category slugs that we know are categories
const KNOWN_CATEGORIES = [
  'belleza-estetica',
  'salud',
  'fitness-bienestar',
  'spa-masajes',
  'servicios-legales',
  'consultoria',
  'automotriz',
  'veterinaria'
];

function SEORouter() {
  const { country, city, slugOrCategory } = useParams();
  const [isCategory, setIsCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Quick check: if it's a known category, render CategoryPage immediately
    if (KNOWN_CATEGORIES.includes(slugOrCategory.toLowerCase())) {
      setIsCategory(true);
      setLoading(false);
      return;
    }

    // Otherwise, check with the API
    const checkType = async () => {
      try {
        // Try to get categories and see if slug matches
        const catRes = await categoriesAPI.getAll();
        const isKnownCategory = catRes.data.some(
          c => c.slug.toLowerCase() === slugOrCategory.toLowerCase()
        );
        
        setIsCategory(isKnownCategory);
      } catch (err) {
        // If error, assume it's a business
        setIsCategory(false);
      } finally {
        setLoading(false);
      }
    };

    checkType();
  }, [slugOrCategory]);

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen pt-20 bg-background">
          <div className="container-app py-16">
            <div className="animate-pulse">
              <div className="h-12 bg-muted rounded w-1/2 mb-8"></div>
              <div className="grid grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-48 bg-muted rounded-lg"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (isCategory) {
    return <Layout><CategoryPage /></Layout>;
  }

  return <Layout><BusinessSEOPage /></Layout>;
}

// Placeholder pages
function ForBusinessPage() {
  const navigate = useNavigate();
  const { t, language } = useI18n();

  const features = [
    { icon: '📅', title: language === 'es' ? 'Agenda inteligente' : 'Smart scheduling', desc: language === 'es' ? 'Calendario visual con vista diaria. Tus clientes reservan en linea y tu agenda se actualiza al instante.' : 'Visual daily calendar. Your clients book online and your schedule updates instantly.' },
    { icon: '👥', title: language === 'es' ? 'Gestion de equipo' : 'Team management', desc: language === 'es' ? 'Agrega trabajadores, asigna horarios individuales y servicios a cada uno. Cada profesional con su propia agenda.' : 'Add workers, assign individual schedules and services. Each professional with their own agenda.' },
    { icon: '💳', title: language === 'es' ? 'Cobros automaticos' : 'Auto payments', desc: language === 'es' ? 'Cobra anticipos via Stripe al momento de la reserva. Reduce cancelaciones y asegura tus ingresos.' : 'Collect deposits via Stripe at booking time. Reduce cancellations and secure your income.' },
    { icon: '📊', title: language === 'es' ? 'Reportes y metricas' : 'Reports & metrics', desc: language === 'es' ? 'Ve cuanto facturas, cuantos clientes tienes y como crece tu negocio con graficas claras.' : 'See your revenue, client count and business growth with clear charts.' },
    { icon: '🔔', title: language === 'es' ? 'Recordatorios automaticos' : 'Auto reminders', desc: language === 'es' ? 'Tus clientes reciben un recordatorio por email 24h antes de su cita. Menos faltas, mas ingresos.' : 'Your clients get an email reminder 24h before their appointment. Less no-shows, more income.' },
    { icon: '🏪', title: language === 'es' ? 'Recepcion digital' : 'Digital reception', desc: language === 'es' ? 'Crea citas para clientes que llegan sin reserva. Busca clientes existentes y registra walk-ins.' : 'Create appointments for walk-in clients. Search existing clients and register walk-ins.' },
  ];

  const steps = [
    { num: '1', title: language === 'es' ? 'Registrate' : 'Register', desc: language === 'es' ? 'Crea tu cuenta con los datos de tu negocio en minutos' : 'Create your account with your business info in minutes' },
    { num: '2', title: language === 'es' ? 'Configura' : 'Set up', desc: language === 'es' ? 'Agrega tus servicios, precios, equipo y horarios' : 'Add your services, prices, team and schedules' },
    { num: '3', title: language === 'es' ? 'Recibe reservas' : 'Get bookings', desc: language === 'es' ? 'Tus clientes te encuentran y reservan en linea' : 'Your clients find you and book online' },
  ];

  return (
    <div className="min-h-screen pt-16 bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-900 text-white py-20 sm:py-28">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900/95 to-[#F05D5E]/20" />
        <div className="absolute top-10 right-10 w-72 h-72 bg-[#F05D5E]/10 rounded-full blur-3xl" />
        <div className="relative z-10 container-app">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#F05D5E]/20 text-[#F05D5E] text-sm font-medium border border-[#F05D5E]/30">
              {language === 'es' ? 'Para profesionales y negocios' : 'For professionals & businesses'}
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-extrabold tracking-tight leading-[1.1]">
              {language === 'es' ? (
                <>Haz crecer tu negocio con <span className="text-[#F05D5E]">reservas en linea</span></>
              ) : (
                <>Grow your business with <span className="text-[#F05D5E]">online bookings</span></>
              )}
            </h1>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              {language === 'es'
                ? 'Gestiona tu agenda, reduce cancelaciones y deja que tus clientes reserven 24/7. Todo desde una sola plataforma.'
                : 'Manage your schedule, reduce cancellations and let your clients book 24/7. All from one platform.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <button onClick={() => navigate('/business/register')}
                className="btn-coral px-8 py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2">
                {language === 'es' ? 'Registrar mi negocio gratis' : 'Register my business free'}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </button>
            </div>
            <p className="text-xs text-white/40">{language === 'es' ? 'Sin compromiso. Cancela cuando quieras.' : 'No commitment. Cancel anytime.'}</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 bg-background">
        <div className="container-app">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? 'Todo lo que necesitas para gestionar tu negocio' : 'Everything you need to manage your business'}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="p-6 rounded-2xl border bg-card hover:shadow-lg transition-shadow">
                <span className="text-3xl">{f.icon}</span>
                <h3 className="font-heading font-bold text-lg mt-4 mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-20 bg-muted/30">
        <div className="container-app">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? 'Empieza en 3 pasos' : 'Start in 3 steps'}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            {steps.map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F05D5E] text-white text-xl font-bold flex items-center justify-center mb-4">{s.num}</div>
                <h3 className="font-heading font-bold text-base mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 sm:py-24 bg-background">
        <div className="container-app">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? 'Simple y accesible' : 'Simple & affordable'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {language === 'es' ? 'Sin sorpresas. Sin contratos.' : 'No surprises. No contracts.'}
            </p>
          </div>
          <div className="max-w-sm mx-auto">
            <div className="rounded-2xl border-2 border-[#F05D5E] p-8 text-center bg-card shadow-lg">
              <p className="text-sm font-medium text-[#F05D5E] mb-2">{language === 'es' ? 'Suscripcion mensual' : 'Monthly subscription'}</p>
              <div className="flex items-end justify-center gap-1 mb-1">
                <span className="text-5xl font-heading font-extrabold">$39</span>
                <span className="text-lg text-muted-foreground mb-1">MXN</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{language === 'es' ? '/mes + 8% comision por reserva' : '/month + 8% fee per booking'}</p>
              <div className="space-y-3 text-left mb-8">
                {[
                  language === 'es' ? 'Agenda ilimitada' : 'Unlimited scheduling',
                  language === 'es' ? 'Trabajadores ilimitados' : 'Unlimited workers',
                  language === 'es' ? 'Cobros con Stripe' : 'Stripe payments',
                  language === 'es' ? 'Recordatorios por email' : 'Email reminders',
                  language === 'es' ? 'Reportes y metricas' : 'Reports & metrics',
                  language === 'es' ? 'Perfil publico en Bookvia' : 'Public profile on Bookvia',
                  language === 'es' ? 'Recepcion digital' : 'Digital reception',
                  language === 'es' ? 'Soporte incluido' : 'Support included',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-[#F05D5E] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {item}
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/business/register')}
                className="w-full btn-coral px-6 py-3.5 rounded-xl text-base font-semibold">
                {language === 'es' ? 'Empezar ahora' : 'Start now'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 bg-slate-900 text-white">
        <div className="container-app text-center space-y-5">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold">
            {language === 'es' ? 'Listo para recibir mas clientes?' : 'Ready to get more clients?'}
          </h2>
          <p className="text-slate-400 max-w-lg mx-auto">
            {language === 'es'
              ? 'Unete a Bookvia y empieza a recibir reservas en linea hoy mismo.'
              : 'Join Bookvia and start receiving online bookings today.'}
          </p>
          <button onClick={() => navigate('/business/register')}
            className="btn-coral px-8 py-4 rounded-xl text-base font-semibold">
            {language === 'es' ? 'Registrar mi negocio' : 'Register my business'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default App;
