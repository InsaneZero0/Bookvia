import { Link } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { Facebook, Twitter, Instagram, Linkedin, Mail, MapPin, Phone } from 'lucide-react';

export function Footer() {
  const { t, language } = useI18n();
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="relative overflow-hidden text-slate-900"
      data-testid="footer"
      style={{
        background: 'linear-gradient(135deg, #fcf7ba 0%, #f5e98a 50%, #e8d670 100%)',
      }}
    >
      {/* Decorative organic blobs (estilo imagen referencia) */}
      <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full opacity-40 blur-2xl"
        style={{ background: 'radial-gradient(circle, #f5d24a 0%, transparent 70%)' }} />
      <div className="absolute top-1/2 -right-32 w-96 h-96 rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, #e8c84a 0%, transparent 70%)' }} />
      <div className="absolute -bottom-32 left-1/3 w-[28rem] h-[28rem] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #d4b73e 0%, transparent 70%)' }} />
      <div className="absolute top-10 left-1/2 w-64 h-64 rounded-full opacity-30 blur-2xl"
        style={{ background: 'radial-gradient(circle, #fff8c4 0%, transparent 70%)' }} />

      <div className="container-app py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="inline-block">
              <span className="text-2xl font-heading font-extrabold text-slate-900">
                Book<span className="text-[#F05D5E]">via</span>
              </span>
            </Link>
            <p className="text-slate-700 text-sm leading-relaxed">
              {language === 'es'
                ? 'Tu plataforma de reservas profesionales. Conectamos clientes con los mejores profesionales y negocios.'
                : 'Your professional booking platform. We connect clients with the best professionals and businesses.'}
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-slate-700 hover:text-[#F05D5E] transition-colors" aria-label="Facebook">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-700 hover:text-[#F05D5E] transition-colors" aria-label="Twitter">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-700 hover:text-[#F05D5E] transition-colors" aria-label="Instagram">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-700 hover:text-[#F05D5E] transition-colors" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-heading font-bold text-lg mb-4 text-slate-900">
              {language === 'es' ? 'Explorar' : 'Explore'}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/search" className="text-slate-700 hover:text-[#F05D5E] text-sm transition-colors font-medium">
                  {t('nav.search')}
                </Link>
              </li>
              <li>
                <Link to="/categories" className="text-slate-700 hover:text-[#F05D5E] text-sm transition-colors font-medium">
                  {t('nav.categories')}
                </Link>
              </li>
              <li>
                <Link to="/for-business" className="text-slate-700 hover:text-[#F05D5E] text-sm transition-colors font-medium">
                  {t('nav.forBusiness')}
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="text-slate-700 hover:text-[#F05D5E] text-sm transition-colors font-medium">
                  {language === 'es' ? '¿Cómo funciona?' : 'How it works?'}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-heading font-bold text-lg mb-4 text-slate-900">
              {language === 'es' ? 'Legal' : 'Legal'}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/terminos" className="text-slate-700 hover:text-[#F05D5E] text-sm transition-colors font-medium">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/privacidad" className="text-slate-700 hover:text-[#F05D5E] text-sm transition-colors font-medium">
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link to="/nosotros" className="text-slate-700 hover:text-[#F05D5E] text-sm transition-colors font-medium">
                  {language === 'es' ? 'Sobre Nosotros' : 'About Us'}
                </Link>
              </li>
              <li>
                <Link to="/ayuda" className="text-slate-700 hover:text-[#F05D5E] text-sm transition-colors font-medium">
                  {t('footer.help')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-heading font-bold text-lg mb-4 text-slate-900">
              {t('footer.contact')}
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-slate-700 text-sm">
                <Mail className="h-4 w-4 text-[#F05D5E] shrink-0" />
                <span>contacto@bookvia.com</span>
              </li>
              <li className="flex items-center gap-3 text-slate-700 text-sm">
                <Phone className="h-4 w-4 text-[#F05D5E] shrink-0" />
                <span>+52 55 1234 5678</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700 text-sm">
                <MapPin className="h-4 w-4 text-[#F05D5E] mt-0.5 shrink-0" />
                <span>Ciudad de México, México</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-900/15 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-700 text-sm">
            © {currentYear} Bookvia. {t('footer.rights')}.
          </p>
          <div className="flex items-center gap-4 text-sm text-slate-700">
            <span className="font-semibold">MXN</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
