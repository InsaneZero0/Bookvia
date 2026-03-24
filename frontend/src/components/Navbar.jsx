import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Menu, X, Sun, Moon, Globe, User, Calendar, Heart, Bell, 
  LogOut, Building2, LayoutDashboard, ChevronDown
} from 'lucide-react';
import { getInitials } from '@/lib/utils';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, isAuthenticated, isAdmin, isBusiness, logout } = useAuth();
  const { t, language, toggleLanguage } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isHomepage = location.pathname === '/';
  const isTransparent = isHomepage && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav 
      data-testid="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isTransparent 
          ? 'bg-transparent' 
          : 'glass border-b border-border/50'
      }`}
    >
      <div className="container-app">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link 
            to="/" 
            className="flex items-center gap-2"
            data-testid="logo-link"
          >
            <span className={`text-2xl font-heading font-extrabold tracking-tight ${
              isTransparent ? 'text-white' : 'text-foreground'
            }`}>
              Book<span className="text-[#F05D5E]">via</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <Link 
              to="/search" 
              className={`text-sm font-medium transition-colors hover:text-[#F05D5E] ${
                isTransparent ? 'text-white/90' : 'text-foreground'
              }`}
              data-testid="nav-search"
            >
              {t('nav.search')}
            </Link>
            <Link 
              to="/categories" 
              className={`text-sm font-medium transition-colors hover:text-[#F05D5E] ${
                isTransparent ? 'text-white/90' : 'text-foreground'
              }`}
              data-testid="nav-categories"
            >
              {t('nav.categories')}
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
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.full_name || user?.email}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate('/admin')} data-testid="menu-admin">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
                  
                  {isBusiness && (
                    <DropdownMenuItem onClick={() => navigate('/business/dashboard')} data-testid="menu-business-dashboard">
                      <Building2 className="mr-2 h-4 w-4" />
                      {t('nav.dashboard')}
                    </DropdownMenuItem>
                  )}
                  
                  {!isBusiness && !isAdmin && (
                    <>
                      <DropdownMenuItem onClick={() => navigate('/dashboard')} data-testid="menu-dashboard">
                        <User className="mr-2 h-4 w-4" />
                        {t('nav.profile')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/bookings')} data-testid="menu-bookings">
                        <Calendar className="mr-2 h-4 w-4" />
                        {t('nav.bookings')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/favorites')} data-testid="menu-favorites">
                        <Heart className="mr-2 h-4 w-4" />
                        {t('nav.favorites')}
                      </DropdownMenuItem>
                    </>
                  )}
                  
                  <DropdownMenuItem onClick={() => navigate('/notifications')} data-testid="menu-notifications">
                    <Bell className="mr-2 h-4 w-4" />
                    {t('nav.notifications')}
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600" data-testid="menu-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('nav.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                {t('nav.search')}
              </Link>
              <Link
                to="/categories"
                className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('nav.categories')}
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
                  <Link
                    to={isBusiness ? '/business/dashboard' : '/dashboard'}
                    className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('nav.dashboard')}
                  </Link>
                  <button
                    onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                    className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-muted rounded-lg text-left"
                  >
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
