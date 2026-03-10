import { Link } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { Facebook, Twitter, Instagram, Linkedin, Mail, MapPin, Phone } from 'lucide-react';

export function Footer() {
  const { t, language } = useI18n();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 dark:bg-slate-950 text-white" data-testid="footer">
      <div className="container-app py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="inline-block">
              <span className="text-2xl font-heading font-extrabold">
                Book<span className="text-[#F05D5E]">via</span>
              </span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed">
              {language === 'es' 
                ? 'Tu plataforma de reservas profesionales. Conectamos clientes con los mejores profesionales y negocios.'
                : 'Your professional booking platform. We connect clients with the best professionals and businesses.'}
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-slate-400 hover:text-[#F05D5E] transition-colors" aria-label="Facebook">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-[#F05D5E] transition-colors" aria-label="Twitter">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-[#F05D5E] transition-colors" aria-label="Instagram">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-[#F05D5E] transition-colors" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-heading font-bold text-lg mb-4">
              {language === 'es' ? 'Explorar' : 'Explore'}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/search" className="text-slate-400 hover:text-white text-sm transition-colors">
                  {t('nav.search')}
                </Link>
              </li>
              <li>
                <Link to="/categories" className="text-slate-400 hover:text-white text-sm transition-colors">
                  {t('nav.categories')}
                </Link>
              </li>
              <li>
                <Link to="/for-business" className="text-slate-400 hover:text-white text-sm transition-colors">
                  {t('nav.forBusiness')}
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="text-slate-400 hover:text-white text-sm transition-colors">
                  {language === 'es' ? '¿Cómo funciona?' : 'How it works?'}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-heading font-bold text-lg mb-4">
              {language === 'es' ? 'Legal' : 'Legal'}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/terminos" className="text-slate-400 hover:text-white text-sm transition-colors">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/privacidad" className="text-slate-400 hover:text-white text-sm transition-colors">
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link to="/nosotros" className="text-slate-400 hover:text-white text-sm transition-colors">
                  {language === 'es' ? 'Sobre Nosotros' : 'About Us'}
                </Link>
              </li>
              <li>
                <Link to="/ayuda" className="text-slate-400 hover:text-white text-sm transition-colors">
                  {t('footer.help')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-heading font-bold text-lg mb-4">
              {t('footer.contact')}
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-slate-400 text-sm">
                <Mail className="h-4 w-4 text-[#F05D5E]" />
                <span>soporte@bookvia.com</span>
              </li>
              <li className="flex items-center gap-3 text-slate-400 text-sm">
                <Phone className="h-4 w-4 text-[#F05D5E]" />
                <span>+52 55 1234 5678</span>
              </li>
              <li className="flex items-start gap-3 text-slate-400 text-sm">
                <MapPin className="h-4 w-4 text-[#F05D5E] mt-0.5" />
                <span>Ciudad de México, México</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-sm">
            © {currentYear} Bookvia. {t('footer.rights')}.
          </p>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>🇲🇽 México</span>
            <span>•</span>
            <span>MXN</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
