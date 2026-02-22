import { createContext, useContext, useState, useEffect } from 'react';

const translations = {
  es: {
    // Navigation
    'nav.home': 'Inicio',
    'nav.search': 'Buscar',
    'nav.categories': 'Categorías',
    'nav.forBusiness': 'Para Negocios',
    'nav.login': 'Iniciar Sesión',
    'nav.register': 'Registrarse',
    'nav.dashboard': 'Mi Panel',
    'nav.logout': 'Cerrar Sesión',
    'nav.profile': 'Perfil',
    'nav.bookings': 'Mis Reservas',
    'nav.favorites': 'Favoritos',
    'nav.notifications': 'Notificaciones',
    
    // Hero
    'hero.title': 'Reserva tu cita perfecta',
    'hero.subtitle': 'Miles de profesionales y negocios te esperan. Encuentra y reserva servicios de belleza, salud, fitness y más.',
    'hero.search.service': '¿Qué servicio buscas?',
    'hero.search.city': '¿En qué ciudad?',
    'hero.search.date': '¿Cuándo?',
    'hero.search.button': 'Buscar',
    
    // Categories
    'categories.title': 'Explora por Categoría',
    'categories.subtitle': 'Encuentra el servicio perfecto para ti',
    'categories.viewAll': 'Ver todas',
    
    // Featured
    'featured.title': 'Negocios Destacados',
    'featured.subtitle': 'Los mejor calificados por nuestra comunidad',
    'featured.viewAll': 'Ver todos',
    
    // How it works
    'howItWorks.title': '¿Cómo funciona?',
    'howItWorks.subtitle': 'Reservar tu cita nunca fue tan fácil',
    'howItWorks.step1.title': 'Busca',
    'howItWorks.step1.desc': 'Encuentra el servicio que necesitas en tu ciudad',
    'howItWorks.step2.title': 'Elige',
    'howItWorks.step2.desc': 'Selecciona fecha, hora y profesional',
    'howItWorks.step3.title': 'Reserva',
    'howItWorks.step3.desc': 'Confirma tu cita en segundos',
    'howItWorks.step4.title': 'Disfruta',
    'howItWorks.step4.desc': 'Asiste a tu cita y deja tu opinión',
    
    // CTA
    'cta.business.title': '¿Tienes un negocio?',
    'cta.business.subtitle': 'Únete a miles de profesionales que ya usan Bookvia para gestionar sus citas y hacer crecer su negocio.',
    'cta.business.button': 'Registra tu Negocio',
    'cta.business.free': 'Primeros 3 meses gratis',
    
    // Auth
    'auth.login.title': 'Bienvenido de vuelta',
    'auth.login.subtitle': 'Ingresa a tu cuenta para continuar',
    'auth.register.title': 'Crea tu cuenta',
    'auth.register.subtitle': 'Únete a la comunidad Bookvia',
    'auth.email': 'Correo electrónico',
    'auth.password': 'Contraseña',
    'auth.fullName': 'Nombre completo',
    'auth.phone': 'Teléfono',
    'auth.birthDate': 'Fecha de nacimiento',
    'auth.gender': 'Género',
    'auth.gender.male': 'Masculino',
    'auth.gender.female': 'Femenino',
    'auth.gender.other': 'Otro',
    'auth.login.button': 'Iniciar Sesión',
    'auth.register.button': 'Crear Cuenta',
    'auth.noAccount': '¿No tienes cuenta?',
    'auth.hasAccount': '¿Ya tienes cuenta?',
    'auth.forgotPassword': '¿Olvidaste tu contraseña?',
    'auth.verifyPhone': 'Verificar Teléfono',
    'auth.verifyPhone.subtitle': 'Ingresa el código enviado a tu teléfono',
    'auth.verifyPhone.code': 'Código de verificación',
    'auth.verifyPhone.button': 'Verificar',
    'auth.verifyPhone.resend': 'Reenviar código',
    
    // Business
    'business.rating': 'calificación',
    'business.reviews': 'reseñas',
    'business.bookNow': 'Reservar Ahora',
    'business.services': 'Servicios',
    'business.about': 'Acerca de',
    'business.location': 'Ubicación',
    'business.hours': 'Horarios',
    'business.staff': 'Equipo',
    'business.allReviews': 'Ver todas las reseñas',
    
    // Booking
    'booking.selectDate': 'Selecciona fecha',
    'booking.selectTime': 'Selecciona hora',
    'booking.selectStaff': 'Selecciona profesional',
    'booking.anyStaff': 'Cualquier profesional disponible',
    'booking.confirm': 'Confirmar Reserva',
    'booking.deposit': 'Anticipo requerido',
    'booking.total': 'Total',
    'booking.duration': 'Duración',
    'booking.minutes': 'minutos',
    'booking.success': '¡Reserva confirmada!',
    'booking.successMessage': 'Te hemos enviado un correo con los detalles.',
    
    // Dashboard
    'dashboard.welcome': 'Bienvenido',
    'dashboard.upcoming': 'Próximas citas',
    'dashboard.past': 'Historial',
    'dashboard.noBookings': 'No tienes citas programadas',
    'dashboard.explore': 'Explorar servicios',
    
    // Common
    'common.loading': 'Cargando...',
    'common.error': 'Ha ocurrido un error',
    'common.tryAgain': 'Intentar de nuevo',
    'common.cancel': 'Cancelar',
    'common.save': 'Guardar',
    'common.edit': 'Editar',
    'common.delete': 'Eliminar',
    'common.confirm': 'Confirmar',
    'common.back': 'Volver',
    'common.next': 'Siguiente',
    'common.seeMore': 'Ver más',
    'common.from': 'Desde',
    'common.perSession': 'por sesión',
    
    // Footer
    'footer.about': 'Acerca de',
    'footer.help': 'Ayuda',
    'footer.terms': 'Términos',
    'footer.privacy': 'Privacidad',
    'footer.contact': 'Contacto',
    'footer.rights': 'Todos los derechos reservados',
    
    // Status
    'status.pending': 'Pendiente',
    'status.confirmed': 'Confirmada',
    'status.completed': 'Completada',
    'status.cancelled': 'Cancelada',
    'status.no_show': 'No asistió',
    
    // Badges
    'badge.new': 'Nuevo',
    'badge.verified': 'Verificado',
    'badge.featured': 'Destacado',
  },
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.search': 'Search',
    'nav.categories': 'Categories',
    'nav.forBusiness': 'For Business',
    'nav.login': 'Log In',
    'nav.register': 'Sign Up',
    'nav.dashboard': 'Dashboard',
    'nav.logout': 'Log Out',
    'nav.profile': 'Profile',
    'nav.bookings': 'My Bookings',
    'nav.favorites': 'Favorites',
    'nav.notifications': 'Notifications',
    
    // Hero
    'hero.title': 'Book your perfect appointment',
    'hero.subtitle': 'Thousands of professionals and businesses await. Find and book beauty, health, fitness services and more.',
    'hero.search.service': 'What service are you looking for?',
    'hero.search.city': 'In which city?',
    'hero.search.date': 'When?',
    'hero.search.button': 'Search',
    
    // Categories
    'categories.title': 'Explore by Category',
    'categories.subtitle': 'Find the perfect service for you',
    'categories.viewAll': 'View all',
    
    // Featured
    'featured.title': 'Featured Businesses',
    'featured.subtitle': 'Top rated by our community',
    'featured.viewAll': 'View all',
    
    // How it works
    'howItWorks.title': 'How it works?',
    'howItWorks.subtitle': 'Booking your appointment has never been easier',
    'howItWorks.step1.title': 'Search',
    'howItWorks.step1.desc': 'Find the service you need in your city',
    'howItWorks.step2.title': 'Choose',
    'howItWorks.step2.desc': 'Select date, time and professional',
    'howItWorks.step3.title': 'Book',
    'howItWorks.step3.desc': 'Confirm your appointment in seconds',
    'howItWorks.step4.title': 'Enjoy',
    'howItWorks.step4.desc': 'Attend your appointment and leave a review',
    
    // CTA
    'cta.business.title': 'Own a business?',
    'cta.business.subtitle': 'Join thousands of professionals who already use Bookvia to manage their appointments and grow their business.',
    'cta.business.button': 'Register your Business',
    'cta.business.free': 'First 3 months free',
    
    // Auth
    'auth.login.title': 'Welcome back',
    'auth.login.subtitle': 'Sign in to your account to continue',
    'auth.register.title': 'Create your account',
    'auth.register.subtitle': 'Join the Bookvia community',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.fullName': 'Full name',
    'auth.phone': 'Phone',
    'auth.birthDate': 'Birth date',
    'auth.gender': 'Gender',
    'auth.gender.male': 'Male',
    'auth.gender.female': 'Female',
    'auth.gender.other': 'Other',
    'auth.login.button': 'Log In',
    'auth.register.button': 'Create Account',
    'auth.noAccount': "Don't have an account?",
    'auth.hasAccount': 'Already have an account?',
    'auth.forgotPassword': 'Forgot your password?',
    'auth.verifyPhone': 'Verify Phone',
    'auth.verifyPhone.subtitle': 'Enter the code sent to your phone',
    'auth.verifyPhone.code': 'Verification code',
    'auth.verifyPhone.button': 'Verify',
    'auth.verifyPhone.resend': 'Resend code',
    
    // Business
    'business.rating': 'rating',
    'business.reviews': 'reviews',
    'business.bookNow': 'Book Now',
    'business.services': 'Services',
    'business.about': 'About',
    'business.location': 'Location',
    'business.hours': 'Hours',
    'business.staff': 'Staff',
    'business.allReviews': 'See all reviews',
    
    // Booking
    'booking.selectDate': 'Select date',
    'booking.selectTime': 'Select time',
    'booking.selectStaff': 'Select professional',
    'booking.anyStaff': 'Any available professional',
    'booking.confirm': 'Confirm Booking',
    'booking.deposit': 'Deposit required',
    'booking.total': 'Total',
    'booking.duration': 'Duration',
    'booking.minutes': 'minutes',
    'booking.success': 'Booking confirmed!',
    'booking.successMessage': 'We have sent you an email with the details.',
    
    // Dashboard
    'dashboard.welcome': 'Welcome',
    'dashboard.upcoming': 'Upcoming appointments',
    'dashboard.past': 'History',
    'dashboard.noBookings': 'You have no scheduled appointments',
    'dashboard.explore': 'Explore services',
    
    // Common
    'common.loading': 'Loading...',
    'common.error': 'An error occurred',
    'common.tryAgain': 'Try again',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.seeMore': 'See more',
    'common.from': 'From',
    'common.perSession': 'per session',
    
    // Footer
    'footer.about': 'About',
    'footer.help': 'Help',
    'footer.terms': 'Terms',
    'footer.privacy': 'Privacy',
    'footer.contact': 'Contact',
    'footer.rights': 'All rights reserved',
    
    // Status
    'status.pending': 'Pending',
    'status.confirmed': 'Confirmed',
    'status.completed': 'Completed',
    'status.cancelled': 'Cancelled',
    'status.no_show': 'No show',
    
    // Badges
    'badge.new': 'New',
    'badge.verified': 'Verified',
    'badge.featured': 'Featured',
  }
};

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bookvia-language') || 'es';
    }
    return 'es';
  });

  useEffect(() => {
    localStorage.setItem('bookvia-language', language);
    document.documentElement.lang = language;
  }, [language]);

  const t = (key) => {
    return translations[language]?.[key] || translations['es'][key] || key;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'es' ? 'en' : 'es');
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, toggleLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
