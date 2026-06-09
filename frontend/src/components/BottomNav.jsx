import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Calendar, Bell, User, LayoutDashboard, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

/**
 * Mobile-only bottom navigation bar.
 * Sticky at the bottom of the viewport on screens < md (768px).
 * Adapts items per role (client / business / admin).
 * Never renders on /status, /login, /signup or in iframe-style routes.
 */
export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { language } = useI18n();
  const isBusiness = user?.role === 'business';
  const isAdmin = user?.role === 'admin';

  // Hide on certain routes to avoid clashing
  const hiddenRoutes = ['/login', '/signup', '/status', '/auth/google/callback'];
  if (hiddenRoutes.some(r => location.pathname.startsWith(r))) return null;
  // Hide on public business profile/checkout to avoid covering CTAs
  if (location.pathname.startsWith('/checkout') || location.pathname.startsWith('/business/reception')) return null;

  let items = [];
  if (!isAuthenticated) {
    items = [
      { to: '/', label: language === 'es' ? 'Explorar' : 'Explore', Icon: Search, testid: 'bnav-explore' },
      { to: '/login', label: language === 'es' ? 'Entrar' : 'Sign in', Icon: User, testid: 'bnav-signin' },
    ];
  } else if (isAdmin) {
    items = [
      { to: '/', label: language === 'es' ? 'Inicio' : 'Home', Icon: Search, testid: 'bnav-home' },
      { to: '/bv-ctrl', label: 'Admin', Icon: LayoutDashboard, testid: 'bnav-admin' },
      { to: '/dashboard', label: language === 'es' ? 'Yo' : 'Me', Icon: User, testid: 'bnav-me' },
    ];
  } else if (isBusiness) {
    items = [
      { to: '/business/dashboard', label: language === 'es' ? 'Panel' : 'Panel', Icon: Building2, testid: 'bnav-biz-dash' },
      { to: '/business/reception', label: language === 'es' ? 'Recepcion' : 'Reception', Icon: Calendar, testid: 'bnav-reception' },
      { to: '/dashboard', label: language === 'es' ? 'Yo' : 'Me', Icon: User, testid: 'bnav-me' },
    ];
  } else {
    // Regular customer
    items = [
      { to: '/', label: language === 'es' ? 'Explorar' : 'Explore', Icon: Search, testid: 'bnav-explore' },
      { to: '/bookings', label: language === 'es' ? 'Mis citas' : 'Bookings', Icon: Calendar, testid: 'bnav-bookings' },
      { to: '/notifications', label: language === 'es' ? 'Avisos' : 'Alerts', Icon: Bell, testid: 'bnav-notifs' },
      { to: '/dashboard', label: language === 'es' ? 'Yo' : 'Me', Icon: User, testid: 'bnav-me' },
    ];
  }

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/70 pb-[env(safe-area-inset-bottom)]"
      data-testid="bottom-nav"
      aria-label={language === 'es' ? 'Navegacion inferior' : 'Bottom navigation'}
    >
      <ul className="grid grid-cols-4 gap-1 py-1.5 px-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ to, label, Icon, testid }) => {
          const active = isActive(to);
          return (
            <li key={to}>
              <button
                onClick={() => {
                  if (to === '/notifications') {
                    // No dedicated /notifications page yet — fire the nav bell or default to dashboard
                    navigate('/dashboard?tab=notifications');
                  } else {
                    navigate(to);
                  }
                }}
                className={`w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors ${
                  active ? 'text-[#F05D5E]' : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid={testid}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={`h-5 w-5 ${active ? 'stroke-[2.3]' : ''}`} />
                <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
