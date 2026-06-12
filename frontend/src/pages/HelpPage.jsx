import { useState, useMemo } from 'react';
import {
  Search, Mail, MessageCircle, AlertOctagon, Send, ChevronDown,
  CheckCircle2, Clock, Building2, User, CreditCard, Bug, Calendar, FileQuestion
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';

const SUPPORT_EMAIL = 'contacto@bookvia.com';
const BUSINESS_WHATSAPP = '524425013331'; // +52 442-501-3331 for businesses only
const SUPPORT_HOURS = { es: 'Lun a Vie · 9:00am - 6:00pm', en: 'Mon - Fri · 9:00am - 6:00pm' };

const FAQ_DATA = [
  // Clientes
  { id: 'c1', audience: 'client', q_es: '¿Cómo hago una reserva?', q_en: 'How do I make a booking?',
    a_es: 'Busca el negocio que te interesa, elige un servicio y selecciona fecha y hora. Si el negocio requiere anticipo, pagarás una parte para confirmar tu cita. Recibirás un correo de confirmación con todos los datos.',
    a_en: 'Search for the business, pick a service and select date/time. If the business requires a deposit, you will pay a portion to confirm. You receive a confirmation email with all details.' },
  { id: 'c2', audience: 'client', q_es: '¿Puedo cancelar mi reserva y recibir un reembolso?', q_en: 'Can I cancel and get a refund?',
    a_es: 'Sí, siempre y cuando canceles dentro del margen que el negocio configuró (por lo general 24 horas antes). Si pagaste un anticipo y cancelas a tiempo, el reembolso llega en 5-7 días hábiles al método de pago original.',
    a_en: 'Yes, as long as you cancel within the business cancellation window (usually 24 hours before). If you paid a deposit and cancel in time, the refund arrives in 5-7 business days to your original payment method.' },
  { id: 'c3', audience: 'client', q_es: '¿Cómo cambio la fecha o servicio de mi reserva?', q_en: 'How do I reschedule my booking?',
    a_es: 'Entra a "Mis citas" y selecciona la reserva. Si el negocio lo permite y aún estás dentro del margen, podrás reagendar sin perder el anticipo.',
    a_en: 'Go to "My bookings" and pick the reservation. If the business allows it and you are still within the window, you can reschedule without losing the deposit.' },
  { id: 'c4', audience: 'client', q_es: 'Mi pago fue rechazado, ¿qué hago?', q_en: 'My payment was declined, what now?',
    a_es: 'Verifica que tu tarjeta tenga fondos, esté habilitada para compras en línea y que el banco no haya detectado un cargo sospechoso. Si el problema persiste, mándanos un correo a contacto@bookvia.com con el número del intento de pago.',
    a_en: 'Check that your card has funds, is enabled for online purchases, and your bank did not flag the charge. If the issue persists, email contacto@bookvia.com with the attempt reference.' },

  // Negocios
  { id: 'b1', audience: 'business', q_es: '¿Cómo funciona la mensualidad?', q_en: 'How does the monthly subscription work?',
    a_es: 'Tienes 30 días gratis. Después se cobra $49.99 MXN/mes automáticamente con la tarjeta que registres. Puedes cancelar cuando quieras desde Configuración → Suscripción.',
    a_en: 'You get 30 days free. After that, $49.99 MXN/month is charged automatically to your registered card. Cancel anytime in Settings → Subscription.' },
  { id: 'b2', audience: 'business', q_es: '¿Cuándo me llega el dinero de los anticipos?', q_en: 'When do I receive deposit funds?',
    a_es: 'Bookvia retiene los anticipos y los libera el día 20 de cada mes a tu cuenta Stripe Connect. De Stripe llega a tu banco al siguiente día hábil. La comisión total es 8.5% sobre cada anticipo, más $8 fijos que paga el cliente.',
    a_en: 'Bookvia holds deposits and releases them on the 20th of each month to your Stripe Connect account. Stripe then forwards to your bank the next business day. Commission is 8.5% on each deposit, plus a fixed $8 paid by the client.' },
  { id: 'b3', audience: 'business', q_es: '¿Puedo dejar de cobrar anticipos en línea?', q_en: 'Can I stop charging online deposits?',
    a_es: 'Sí. Ve a Configuración → Cobros y selecciona "Cobro en el local". Las reservas que ya hayan pagado anticipo siguen su flujo normal. Solo puedes cambiar de modalidad cada 30 días.',
    a_en: 'Yes. Go to Settings → Payments and select "Pay at location". Bookings that already paid keep their flow. You can change modality every 30 days.' },
  { id: 'b4', audience: 'business', q_es: '¿Por qué necesito Stripe Connect?', q_en: 'Why do I need Stripe Connect?',
    a_es: 'Stripe Connect es la forma segura y legal de recibir dinero de tus clientes. Solo lo necesitas si decides cobrar anticipos en línea. Si solo cobras en el local, no se requiere.',
    a_en: 'Stripe Connect is the secure, legal way to receive client funds. Only needed if you charge online deposits. Pay-at-location does not require it.' },
  { id: 'b5', audience: 'business', q_es: '¿Cómo agrego personal a mi negocio?', q_en: 'How do I add staff members?',
    a_es: 'En tu panel ve a la pestaña "Equipo" y haz click en "Agregar". Cada miembro recibe un acceso con permisos limitados que tú controlas.',
    a_en: 'In your dashboard go to the "Team" tab and click "Add". Each member gets limited access with permissions you control.' },
];

export default function HelpPage() {
  const { language } = useI18n();
  const { user, isAuthenticated } = useAuth();
  const t = (es, en) => (language === 'es' ? es : en);
  const isBusiness = user?.role === 'business';

  const [search, setSearch] = useState('');
  const [audienceFilter, setAudienceFilter] = useState(isBusiness ? 'business' : 'all');
  const [expandedFaq, setExpandedFaq] = useState(null);

  const [formData, setFormData] = useState({
    name: user?.full_name || '',
    email: user?.email || '',
    category: 'general',
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [ticketRef, setTicketRef] = useState(null);

  const filteredFaqs = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();
    return FAQ_DATA.filter(f => {
      if (audienceFilter !== 'all' && f.audience !== audienceFilter) return false;
      if (!lowerSearch) return true;
      const haystack = `${f.q_es} ${f.q_en} ${f.a_es} ${f.a_en}`.toLowerCase();
      return haystack.includes(lowerSearch);
    });
  }, [search, audienceFilter]);

  const submitTicket = async () => {
    if (!formData.name.trim() || !formData.email.trim() || !formData.subject.trim() || !formData.message.trim()) {
      toast.error(t('Completa todos los campos', 'Fill out all fields'));
      return;
    }
    setSubmitting(true);
    try {
      let res;
      if (isAuthenticated) {
        res = await api.post('/support/tickets', {
          subject: formData.subject,
          message: formData.message,
          category: formData.category,
        });
        setTicketRef(res.data?.id ? `BV-${res.data.id.slice(0, 8).toUpperCase()}` : t('Recibido', 'Received'));
      } else {
        res = await api.post('/support/public-ticket', formData);
        setTicketRef(res.data?.public_ref || t('Recibido', 'Received'));
      }
      toast.success(t('Mensaje enviado. Te responderemos pronto.', 'Message sent. We will reply soon.'));
      setFormData(f => ({ ...f, subject: '', message: '' }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error al enviar. Intenta de nuevo.', 'Send failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openWhatsApp = () => {
    const msg = encodeURIComponent(t(
      'Hola, soy un negocio en Bookvia y necesito ayuda con: ',
      'Hi, I am a business on Bookvia and I need help with: ',
    ));
    window.open(`https://wa.me/${BUSINESS_WHATSAPP}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  const openEmergencyEmail = () => {
    const subject = encodeURIComponent(t('URGENTE - ', 'URGENT - '));
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
  };

  return (
    <div className="min-h-screen bg-background" data-testid="help-page">
      <div className="container-app max-w-4xl py-10 space-y-8">
        {/* Hero */}
        <header className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">
            {t('¿En qué te podemos ayudar?', 'How can we help?')}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            {t('Horario de atención:', 'Support hours:')} {SUPPORT_HOURS[language] || SUPPORT_HOURS.es}
          </p>
        </header>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('Busca tu pregunta...', 'Search your question...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-12 text-base"
            data-testid="help-search-input"
          />
        </div>

        {/* Contact channels grid */}
        <section className="grid sm:grid-cols-3 gap-3" aria-label={t('Canales de contacto', 'Contact channels')}>
          {/* WhatsApp - business only */}
          {isBusiness ? (
            <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 cursor-pointer hover:shadow-md transition-all" onClick={openWhatsApp} data-testid="help-whatsapp-card">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <Badge className="bg-emerald-600 text-white text-[10px]">{t('Solo negocios', 'Business only')}</Badge>
                </div>
                <h3 className="font-semibold text-sm">{t('WhatsApp directo', 'Direct WhatsApp')}</h3>
                <p className="text-xs text-muted-foreground">+52 442 501 3331</p>
                <p className="text-xs text-emerald-700 font-medium">{t('Respuesta más rápida', 'Fastest response')}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/60 cursor-pointer hover:shadow-md transition-all" onClick={() => document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' })} data-testid="help-form-card">
              <CardContent className="p-5 space-y-2">
                <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 inline-block">
                  <FileQuestion className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm">{t('Envianos un ticket', 'Send a ticket')}</h3>
                <p className="text-xs text-muted-foreground">{t('Te respondemos en menos de 24h', 'We reply in under 24h')}</p>
              </CardContent>
            </Card>
          )}

          {/* Email general */}
          <Card className="border-border/60 cursor-pointer hover:shadow-md transition-all" onClick={() => window.location.href = `mailto:${SUPPORT_EMAIL}`} data-testid="help-email-card">
            <CardContent className="p-5 space-y-2">
              <div className="p-2.5 rounded-xl bg-violet-100 text-violet-700 inline-block">
                <Mail className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-sm">{t('Correo electronico', 'Email')}</h3>
              <p className="text-xs text-muted-foreground break-all">{SUPPORT_EMAIL}</p>
              <p className="text-xs text-violet-700 font-medium">{t('Sin urgencia', 'Non-urgent')}</p>
            </CardContent>
          </Card>

          {/* Emergency */}
          <Card className="border-red-200 bg-red-50/40 dark:bg-red-900/10 cursor-pointer hover:shadow-md transition-all" onClick={openEmergencyEmail} data-testid="help-emergency-card">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-red-100 text-red-700">
                  <AlertOctagon className="h-5 w-5" />
                </div>
                <Badge className="bg-red-600 text-white text-[10px]">{t('Emergencia', 'Emergency')}</Badge>
              </div>
              <h3 className="font-semibold text-sm">{t('Cobro o fraude', 'Charges or fraud')}</h3>
              <p className="text-xs text-muted-foreground">{t('Cargo incorrecto, fraude, problema critico', 'Wrong charge, fraud, critical issue')}</p>
            </CardContent>
          </Card>
        </section>

        {/* FAQ */}
        <section className="space-y-3" aria-labelledby="faq-heading">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 id="faq-heading" className="font-heading font-semibold text-lg">
              {t('Preguntas frecuentes', 'Frequently asked questions')}
            </h2>
            <div className="flex gap-1.5">
              {[
                { v: 'all', l: t('Todo', 'All') },
                { v: 'client', l: t('Clientes', 'Clients'), icon: User },
                { v: 'business', l: t('Negocios', 'Businesses'), icon: Building2 },
              ].map(opt => {
                const active = audienceFilter === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => setAudienceFilter(opt.v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${active ? 'bg-[#F05D5E] text-white' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}
                    data-testid={`faq-filter-${opt.v}`}
                  >
                    {opt.icon && <opt.icon className="inline h-3 w-3 mr-1" />}{opt.l}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2" data-testid="faq-list">
            {filteredFaqs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {t('No encontramos resultados. Mandanos tu pregunta abajo.', 'No results. Send us your question below.')}
              </p>
            ) : filteredFaqs.map(f => {
              const open = expandedFaq === f.id;
              return (
                <Card key={f.id} className="border-border/60 overflow-hidden">
                  <button
                    onClick={() => setExpandedFaq(open ? null : f.id)}
                    className="w-full text-left px-5 py-4 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors"
                    data-testid={`faq-item-${f.id}`}
                    aria-expanded={open}
                  >
                    <span className="font-medium text-sm flex-1">{language === 'es' ? f.q_es : f.q_en}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 mt-0.5 transition-transform text-muted-foreground ${open ? 'rotate-180 text-[#F05D5E]' : ''}`} />
                  </button>
                  {open && (
                    <CardContent className="px-5 pb-4 pt-0">
                      <p className="text-sm text-muted-foreground leading-relaxed">{language === 'es' ? f.a_es : f.a_en}</p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </section>

        {/* Contact form */}
        <section id="contact-form" className="space-y-4" aria-labelledby="contact-heading">
          <h2 id="contact-heading" className="font-heading font-semibold text-lg">
            {t('No encontraste lo que buscabas?', "Didn't find what you needed?")}
          </h2>

          {ticketRef ? (
            <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20" data-testid="help-ticket-success">
              <CardContent className="p-5 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-emerald-900 dark:text-emerald-200">
                    {t('Mensaje recibido', 'Message received')}
                  </p>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300 mt-1">
                    {t('Tu numero de ticket:', 'Your ticket number:')} <span className="font-mono font-bold">{ticketRef}</span>
                  </p>
                  <p className="text-xs text-emerald-700 mt-2">
                    {t('Guarda esta referencia. Te responderemos a ', 'Save this reference. We will reply to ')}<strong>{formData.email}</strong>{t(' en menos de 24 horas.', ' within 24 hours.')}
                  </p>
                  <Button variant="link" className="px-0 h-auto text-xs text-emerald-700" onClick={() => setTicketRef(null)} data-testid="help-send-another">
                    {t('Enviar otro mensaje', 'Send another message')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="help-name" className="text-xs">{t('Nombre', 'Name')}</Label>
                    <Input id="help-name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="mt-1" data-testid="help-name-input" />
                  </div>
                  <div>
                    <Label htmlFor="help-email" className="text-xs">{t('Correo', 'Email')}</Label>
                    <Input id="help-email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="mt-1" data-testid="help-email-input" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t('Categoria', 'Category')}</Label>
                  <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
                    <SelectTrigger className="mt-1" data-testid="help-category-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general"><FileQuestion className="inline h-3.5 w-3.5 mr-1.5" />{t('General', 'General')}</SelectItem>
                      <SelectItem value="booking"><Calendar className="inline h-3.5 w-3.5 mr-1.5" />{t('Sobre una reserva', 'About a booking')}</SelectItem>
                      <SelectItem value="payment"><CreditCard className="inline h-3.5 w-3.5 mr-1.5" />{t('Pagos / facturacion', 'Payments / billing')}</SelectItem>
                      <SelectItem value="account"><User className="inline h-3.5 w-3.5 mr-1.5" />{t('Mi cuenta', 'My account')}</SelectItem>
                      <SelectItem value="bug"><Bug className="inline h-3.5 w-3.5 mr-1.5" />{t('Reportar un error', 'Report a bug')}</SelectItem>
                      <SelectItem value="other">{t('Otro', 'Other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="help-subject" className="text-xs">{t('Asunto', 'Subject')}</Label>
                  <Input id="help-subject" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} maxLength={200} className="mt-1" data-testid="help-subject-input" />
                </div>
                <div>
                  <Label htmlFor="help-msg" className="text-xs">{t('Mensaje', 'Message')}</Label>
                  <Textarea id="help-msg" value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} rows={5} maxLength={5000} className="mt-1" data-testid="help-message-input" />
                  <p className="text-[10px] text-muted-foreground text-right mt-1">{formData.message.length} / 5000</p>
                </div>
                <Button onClick={submitTicket} disabled={submitting} className="btn-coral w-full" data-testid="help-submit-btn">
                  {submitting ? t('Enviando...', 'Sending...') : (<><Send className="h-4 w-4 mr-1.5" />{t('Enviar mensaje', 'Send message')}</>)}
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
