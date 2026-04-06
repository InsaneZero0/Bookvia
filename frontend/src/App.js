import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
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
              
              {/* User Pages */}
              <Route path="/dashboard" element={<Layout><UserDashboardPage /></Layout>} />
              <Route path="/dashboard/bookings" element={<Layout><UserBookingsPage /></Layout>} />
              <Route path="/bookings" element={<Layout><UserBookingsPage /></Layout>} />
              <Route path="/favorites" element={<Layout><SearchPage /></Layout>} />
              <Route path="/notifications" element={<Layout><UserDashboardPage /></Layout>} />
              
              {/* Business Pages - MUST be before /business/:slug */}
              <Route path="/business/dashboard" element={<Layout showFooter={false}><BusinessDashboardPage /></Layout>} />
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
  return (
    <div className="min-h-screen pt-20 bg-background">
      <div className="container-app py-16 text-center">
        <h1 className="text-4xl font-heading font-bold mb-4">Para Negocios</h1>
        <p className="text-muted-foreground mb-8">Únete a la plataforma de reservas líder</p>
        <a href="/business/register" className="btn-coral inline-block px-8 py-4 rounded-full">
          Registrar mi Negocio
        </a>
      </div>
    </div>
  );
}

export default App;
