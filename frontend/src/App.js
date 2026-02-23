import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

// Pages
import HomePage from '@/pages/HomePage';
import SearchPage from '@/pages/SearchPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import BusinessRegisterPage from '@/pages/BusinessRegisterPage';
import BusinessProfilePage from '@/pages/BusinessProfilePage';
import UserDashboardPage from '@/pages/UserDashboardPage';
import UserBookingsPage from '@/pages/UserBookingsPage';
import BusinessDashboardPage from '@/pages/BusinessDashboardPage';
import BusinessFinancePage from '@/pages/BusinessFinancePage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import PaymentSuccessPage from '@/pages/PaymentSuccessPage';
import PaymentCancelPage from '@/pages/PaymentCancelPage';
import NotFoundPage from '@/pages/NotFoundPage';

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
          <BrowserRouter>
            <Routes>
              {/* Public Pages */}
              <Route path="/" element={<Layout><HomePage /></Layout>} />
              <Route path="/search" element={<Layout><SearchPage /></Layout>} />
              <Route path="/categories" element={<Layout><SearchPage /></Layout>} />
              <Route path="/business/:slug" element={<Layout><BusinessProfilePage /></Layout>} />
              
              {/* Auth Pages */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              
              {/* User Pages */}
              <Route path="/dashboard" element={<Layout><UserDashboardPage /></Layout>} />
              <Route path="/dashboard/bookings" element={<Layout><UserBookingsPage /></Layout>} />
              <Route path="/bookings" element={<Layout><UserBookingsPage /></Layout>} />
              <Route path="/favorites" element={<Layout><SearchPage /></Layout>} />
              <Route path="/notifications" element={<Layout><UserDashboardPage /></Layout>} />
              
              {/* Business Pages */}
              <Route path="/business/dashboard" element={<Layout showFooter={false}><BusinessDashboardPage /></Layout>} />
              <Route path="/business/finance" element={<Layout showFooter={false}><BusinessFinancePage /></Layout>} />
              <Route path="/for-business" element={<Layout><ForBusinessPage /></Layout>} />
              <Route path="/business/register" element={<BusinessRegisterPage />} />
              
              {/* Payment Pages */}
              <Route path="/payment/success" element={<Layout><PaymentSuccessPage /></Layout>} />
              <Route path="/payment/cancel" element={<Layout><PaymentCancelPage /></Layout>} />
              
              {/* Admin Pages */}
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin" element={<Layout showFooter={false}><AdminDashboardPage /></Layout>} />
              
              {/* Catch all */}
              <Route path="*" element={<Layout><NotFoundPage /></Layout>} />
            </Routes>
            <Toaster position="top-center" richColors />
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
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
