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
              
              {/* Admin Pages */}
              <Route path="/bv-ctrl/login" element={<AdminLoginPage />} />
              <Route path="/bv-ctrl" element={<Layout showFooter={false}><AdminDashboardPage /></Layout>} />
              <Route path="/bv-ctrl/*" element={<AdminLoginPage />} />
              
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
    { icon: '🕐', title: language === 'es' ? 'Reservas 24/7' : 'Bookings 24/7', desc: language === 'es' ? 'Tus clientes agendan citas a cualquier hora del día, incluso cuando tu negocio está cerrado. Nunca pierdas una venta por un horario.' : 'Your clients book at any time, even when your business is closed. Never lose a sale due to schedule.' },
    { icon: '👥', title: language === 'es' ? 'Agenda y equipo organizado' : 'Organized schedule & team', desc: language === 'es' ? 'Organiza tu agenda y la de tus trabajadores en un solo lugar. Cada profesional con sus servicios, horarios y citas.' : 'Organize your schedule and your team in one place. Each professional with their own services, hours and appointments.' },
    { icon: '📸', title: language === 'es' ? 'Muestra tu trabajo' : 'Showcase your work', desc: language === 'es' ? 'Publica fotos de tus instalaciones y trabajos realizados. Genera confianza antes de que el cliente entre por la puerta.' : 'Publish photos of your facilities and past work. Build trust before the client walks in.' },
    { icon: '📍', title: language === 'es' ? 'Ubicación con Google Maps' : 'Location with Google Maps', desc: language === 'es' ? 'Tus clientes te encuentran fácil con mapas integrados. Direcciones precisas, ruta y tiempo estimado de llegada.' : 'Clients find you easily with integrated maps. Precise directions, route and ETA.' },
    { icon: '💳', title: language === 'es' ? 'Anticipos y cero cancelaciones' : 'Deposits & zero cancellations', desc: language === 'es' ? 'Cobra anticipos online al momento de la reserva vía Stripe. Reduce cancelaciones y asegura tus ingresos.' : 'Collect online deposits at booking time via Stripe. Reduce cancellations and secure your income.' },
    { icon: '⚡', title: language === 'es' ? 'Adios al tiempo perdido' : 'No more wasted time', desc: language === 'es' ? 'Elimina horas atendiendo llamadas, revisando agenda y tomando notas. Bookvia automatiza todo y enfoca tu tiempo en atender clientes.' : 'Stop wasting hours on calls, checking schedules and taking notes. Bookvia automates it all so you focus on clients.' },
  ];

  const steps = [
    { num: '1', title: language === 'es' ? 'Registrate' : 'Register', desc: language === 'es' ? 'Crea tu cuenta con los datos de tu negocio en minutos' : 'Create your account with your business info in minutes' },
    { num: '2', title: language === 'es' ? 'Configura' : 'Set up', desc: language === 'es' ? 'Agrega tus servicios, precios, equipo y horarios' : 'Add your services, prices, team and schedules' },
    { num: '3', title: language === 'es' ? 'Recibe reservas' : 'Get bookings', desc: language === 'es' ? 'Tus clientes te encuentran y reservan en linea' : 'Your clients find you and book online' },
  ];

  return (
    <div className="min-h-screen pt-16 bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#fcf7ba] text-slate-900 py-20 sm:py-28">
        <div className="absolute inset-0 bg-gradient-to-r from-[#fcf7ba] via-[#fcf7ba]/80 to-white" />
        <div className="absolute top-10 right-10 w-72 h-72 bg-[#F05D5E]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-[#F05D5E]/10 rounded-full blur-3xl" />
        <div className="relative z-10 container-app">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#F05D5E]/15 text-[#F05D5E] text-sm font-medium border border-[#F05D5E]/30">
              {language === 'es' ? 'Para profesionales y negocios' : 'For professionals & businesses'}
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-extrabold tracking-tight leading-[1.1]">
              {language === 'es' ? (
                <>Haz crecer tu negocio con <span className="text-[#F05D5E]">reservas en linea</span></>
              ) : (
                <>Grow your business with <span className="text-[#F05D5E]">online bookings</span></>
              )}
            </h1>
            <p className="text-lg text-slate-700 max-w-2xl mx-auto">
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
            <p className="text-xs text-slate-500">{language === 'es' ? 'Sin compromiso. Cancela cuando quieras.' : 'No commitment. Cancel anytime.'}</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 bg-background relative overflow-hidden">
        <div className="absolute top-20 right-0 w-72 h-72 bg-[#fcf7ba]/40 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-0 w-96 h-96 bg-[#F05D5E]/5 rounded-full blur-3xl" />
        <div className="container-app relative z-10">
          <div className="text-center mb-14 max-w-3xl mx-auto">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#F05D5E]/10 text-[#F05D5E] text-xs font-bold uppercase tracking-wider mb-4">
              {language === 'es' ? 'Beneficios de Bookvia' : 'Bookvia benefits'}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-extrabold tracking-tight leading-tight">
              {language === 'es' ? (
                <>Lo que <span className="text-[#F05D5E]">Bookvia</span> hace por ti</>
              ) : (
                <>What <span className="text-[#F05D5E]">Bookvia</span> does for you</>
              )}
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground mt-4">
              {language === 'es'
                ? 'Más reservas, menos pérdidas y todo el control de tu negocio en un solo lugar.'
                : 'More bookings, fewer losses and full control of your business in one place.'}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="group relative p-7 rounded-2xl border bg-card hover:shadow-xl hover:-translate-y-1 hover:border-[#F05D5E]/30 transition-all duration-300">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#fcf7ba] to-[#F05D5E]/15 flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="font-heading font-bold text-lg mb-3 text-foreground">{f.title}</h3>
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
      <section className="py-16 sm:py-24 bg-background relative overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-[#fcf7ba]/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#F05D5E]/5 rounded-full blur-3xl" />
        <div className="container-app relative z-10">

          {/* Promo banner - 30 dias gratis */}
          <div className="max-w-4xl mx-auto mb-10">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#F05D5E] via-[#e8504f] to-[#d94748] p-1 shadow-2xl">
              <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 20% 50%, #fcf7ba 0%, transparent 50%)' }} />
              <div className="relative bg-gradient-to-r from-[#F05D5E] to-[#d94748] rounded-3xl px-6 sm:px-10 py-6 sm:py-7 flex flex-col sm:flex-row items-center justify-between gap-5">
                <div className="flex items-center gap-4 text-white">
                  <div className="hidden sm:flex h-14 w-14 rounded-2xl bg-white/20 backdrop-blur items-center justify-center text-3xl shrink-0">
                    🎉
                  </div>
                  <div className="text-center sm:text-left">
                    <div className="inline-block bg-[#fcf7ba] text-[#d94748] text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full mb-1.5">
                      {language === 'es' ? 'Oferta de lanzamiento' : 'Launch offer'}
                    </div>
                    <h3 className="font-heading font-extrabold text-xl sm:text-2xl lg:text-3xl text-white leading-tight">
                      {language === 'es' ? '30 días totalmente GRATIS' : '30 days totally FREE'}
                    </h3>
                    <p className="text-white/90 text-sm mt-1">
                      {language === 'es'
                        ? 'Prueba todas las funciones sin pagar nada el primer mes.'
                        : 'Try all features without paying anything the first month.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/business/register')}
                  className="bg-white text-[#F05D5E] hover:bg-[#fcf7ba] hover:scale-105 transition-all px-6 py-3 rounded-xl font-bold whitespace-nowrap shadow-xl flex items-center gap-2"
                  data-testid="pricing-promo-cta"
                >
                  {language === 'es' ? 'Empezar gratis' : 'Start free'}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </button>
              </div>
            </div>
          </div>

          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? 'Simple y accesible' : 'Simple & affordable'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {language === 'es' ? 'Sin sorpresas. Sin contratos.' : 'No surprises. No contracts.'}
            </p>
          </div>
          <div className="max-w-sm mx-auto">
            <div className="rounded-2xl border-2 border-[#F05D5E] p-8 text-center bg-card shadow-lg relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-extrabold uppercase tracking-wider px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                {language === 'es' ? '✨ Primer mes gratis' : '✨ First month free'}
              </div>
              <p className="text-sm font-medium text-[#F05D5E] mb-2 mt-2">{language === 'es' ? 'Suscripcion mensual' : 'Monthly subscription'}</p>
              <div className="flex items-end justify-center gap-1 mb-1">
                <span className="text-5xl font-heading font-extrabold">$39</span>
                <span className="text-lg text-muted-foreground mb-1">MXN</span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{language === 'es' ? '/mes + 8% comision por reserva' : '/month + 8% fee per booking'}</p>
              <p className="text-xs text-emerald-600 font-semibold mb-6">
                {language === 'es' ? 'Después de tus 30 días gratis' : 'After your 30 free days'}
              </p>
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
      <section className="py-16 bg-[#fcf7ba] text-slate-900 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#F05D5E]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#F05D5E]/10 rounded-full blur-3xl" />
        <div className="container-app text-center space-y-5 relative z-10">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold">
            {language === 'es' ? 'Listo para recibir mas clientes?' : 'Ready to get more clients?'}
          </h2>
          <p className="text-slate-700 max-w-lg mx-auto">
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
