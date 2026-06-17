import { Link } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { Facebook, Twitter, Instagram, Linkedin, Mail, MapPin, Shield } from 'lucide-react';

export function Footer() {
  const { t, language } = useI18n();
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="relative overflow-hidden text-white"
      data-testid="footer"
      style={{
        background: 'linear-gradient(135deg, #1a2844 0%, #243b5a 50%, #1a2844 100%)',
      }}
    >
      {/* Subtle decorative accents - toque cálido para conectar con amarillo/coral */}
      <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #F05D5E 0%, transparent 70%)' }} />
      <div className="absolute top-1/2 -right-32 w-96 h-96 rounded-full opacity-15 blur-3xl"
        style={{ background: 'radial-gradient(circle, #fcf7ba 0%, transparent 70%)' }} />
      <div className="absolute -bottom-32 left-1/3 w-[28rem] h-[28rem] rounded-full opacity-10 blur-3xl"
        style={{ background: 'radial-gradient(circle, #F05D5E 0%, transparent 70%)' }} />

      <div className="container-app py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="inline-block">
              <span className="text-2xl font-heading font-extrabold text-white">
                Book<span className="text-[#F05D5E]">via</span>
              </span>
            </Link>
            <p className="text-slate-300 text-sm leading-relaxed">
              {language === 'es'
                ? 'Tu plataforma de reservas profesionales. Conectamos clientes con los mejores profesionales y negocios.'
                : 'Your professional booking platform. We connect clients with the best professionals and businesses.'}
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-slate-300 hover:text-[#F05D5E] transition-colors" aria-label="Facebook">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-300 hover:text-[#F05D5E] transition-colors" aria-label="Twitter">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-300 hover:text-[#F05D5E] transition-colors" aria-label="Instagram">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-300 hover:text-[#F05D5E] transition-colors" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-heading font-bold text-lg mb-4 text-white">
              {language === 'es' ? 'Explorar' : 'Explore'}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/search" className="text-slate-300 hover:text-[#F05D5E] text-sm transition-colors">
                  {language === 'es' ? 'Negocios' : 'Businesses'}
                </Link>
              </li>
              <li>
                <Link to="/beneficios" className="text-slate-300 hover:text-[#F05D5E] text-sm transition-colors">
                  {language === 'es' ? 'Beneficios' : 'Benefits'}
                </Link>
              </li>
              <li>
                <Link to="/for-business" className="text-slate-300 hover:text-[#F05D5E] text-sm transition-colors">
                  {t('nav.forBusiness')}
                </Link>
              </li>
              <li>
                <Link to="/sobre-nosotros" className="text-slate-300 hover:text-[#F05D5E] text-sm transition-colors" data-testid="footer-about-link">
                  {language === 'es' ? 'Sobre nosotros' : 'About us'}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-heading font-bold text-lg mb-4 text-white">
              {language === 'es' ? 'Legal' : 'Legal'}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/terminos" className="text-slate-300 hover:text-[#F05D5E] text-sm transition-colors">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/privacidad" className="text-slate-300 hover:text-[#F05D5E] text-sm transition-colors">
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link to="/nosotros" className="text-slate-300 hover:text-[#F05D5E] text-sm transition-colors">
                  {language === 'es' ? 'Sobre Nosotros' : 'About Us'}
                </Link>
              </li>
              <li>
                <Link to="/ayuda" className="text-slate-300 hover:text-[#F05D5E] text-sm transition-colors">
                  {t('footer.help')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-heading font-bold text-lg mb-4 text-white">
              {t('footer.contact')}
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-slate-300 text-sm">
                <Mail className="h-4 w-4 text-[#F05D5E] shrink-0" />
                <span>contacto@bookvia.com</span>
              </li>
              <li className="flex items-start gap-3 text-slate-300 text-sm">
                <MapPin className="h-4 w-4 text-[#F05D5E] mt-0.5 shrink-0" />
                <span>Santiago de Querétaro, Qro.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-400 text-sm">
            © {currentYear} Bookvia. {t('footer.rights')}.
          </p>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            {/* Pagos seguros con Stripe */}
            <div className="flex items-center gap-2 text-xs" data-testid="footer-stripe-badge">
              <Shield className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-slate-300">Pagos seguros con</span>
              <span className="font-bold text-white">Stripe</span>
              <div className="flex items-center gap-1 ml-1 pl-2 border-l border-white/15">
                <svg className="h-3.5 w-auto" viewBox="0 0 32 20" fill="none" aria-label="Visa">
                  <rect width="32" height="20" rx="2" fill="#1A1F71"/>
                  <text x="16" y="14" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="Arial">VISA</text>
                </svg>
                <svg className="h-3.5 w-auto" viewBox="0 0 32 20" fill="none" aria-label="Mastercard">
                  <rect width="32" height="20" rx="2" fill="#000"/>
                  <circle cx="13" cy="10" r="5" fill="#EB001B" opacity="0.9"/>
                  <circle cx="19" cy="10" r="5" fill="#F79E1B" opacity="0.9"/>
                </svg>
                <svg className="h-3.5 w-auto" viewBox="0 0 32 20" fill="none" aria-label="American Express">
                  <rect width="32" height="20" rx="2" fill="#2E77BB"/>
                  <text x="16" y="14" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold" fontFamily="Arial">AMEX</text>
                </svg>
              </div>
            </div>
            <span className="font-semibold">MXN</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
