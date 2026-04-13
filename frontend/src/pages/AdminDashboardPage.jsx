import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { adminAPI } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Users, Building2, Calendar, DollarSign, CheckCircle2, XCircle, Clock,
  Shield, FileText, Search, Ban, ChevronLeft, ChevronRight, Download,
  Eye, Star, Wallet, BarChart3, Loader2, MapPin, Phone, Mail, Globe,
  CreditCard, Briefcase, MessageSquare, Trash2, ExternalLink, TrendingUp
} from 'lucide-react';

const STATUS_COLORS = {
  approved: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  suspended: 'bg-red-100 text-red-700',
  rejected: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  none: 'bg-gray-100 text-gray-500',
  past_due: 'bg-red-100 text-red-700',
};

/* ─── Small reusable pieces ─── */
function InfoRow({ label, value, icon: Icon }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-sm font-medium break-all">{value}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mt-5 mb-2 border-b pb-1">{children}</h4>;
}

/* ─── Business Detail Dialog ─── */
function BusinessDetailDialog({ businessId, open, onClose, onApprove, onReject, t, language }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !businessId) return;
    setLoading(true);
    adminAPI.getBusinessDetail(businessId)
      .then(res => setDetail(res.data))
      .catch(() => toast.error('Error loading detail'))
      .finally(() => setLoading(false));
  }, [open, businessId]);

  const biz = detail?.business;
  const owner = detail?.owner;
  const stats = detail?.stats;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="business-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {loading ? t('Cargando...', 'Loading...') : biz?.name || 'Detalle'}
          </DialogTitle>
          <DialogDescription>
            {t('Revision completa del negocio antes de aprobar o rechazar', 'Full business review before approval or rejection')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : biz ? (
          <div className="space-y-1" data-testid="business-detail-content">
            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              <Badge className={STATUS_COLORS[biz.status] || 'bg-gray-100'}>{biz.status}</Badge>
              {biz.subscription_status && <Badge variant="outline">{biz.subscription_status}</Badge>}
              {biz.is_featured && <Badge className="bg-amber-100 text-amber-700"><Star className="h-3 w-3 mr-1" />Destacado</Badge>}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[
                { label: t('Reservas', 'Bookings'), value: stats?.total_bookings || 0, color: 'text-blue-600' },
                { label: t('Completadas', 'Completed'), value: stats?.completed_bookings || 0, color: 'text-green-600' },
                { label: t('Ingresos', 'Revenue'), value: formatCurrency(stats?.total_revenue || 0), color: 'text-emerald-600' },
              ].map((s, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-muted/50">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* General info */}
            <SectionTitle>{t('Informacion General', 'General Information')}</SectionTitle>
            <InfoRow icon={Building2} label={t('Nombre', 'Name')} value={biz.name} />
            <InfoRow icon={Mail} label="Email" value={biz.email} />
            <InfoRow icon={Phone} label={t('Telefono', 'Phone')} value={biz.phone} />
            <InfoRow icon={Globe} label={t('Sitio web', 'Website')} value={biz.website} />
            <InfoRow icon={MapPin} label={t('Direccion', 'Address')} value={[biz.address, biz.exterior_number, biz.colony, biz.city, biz.state].filter(Boolean).join(', ')} />
            <InfoRow icon={Briefcase} label={t('Categoria', 'Category')} value={biz.category} />
            {biz.description && (
              <div className="mt-2 p-3 rounded-lg bg-muted/50 text-sm">{biz.description}</div>
            )}

            {/* Legal documents */}
            <SectionTitle>{t('Documentos Legales', 'Legal Documents')}</SectionTitle>
            <InfoRow icon={FileText} label="RFC" value={biz.rfc || t('No proporcionado', 'Not provided')} />
            <InfoRow icon={FileText} label="CURP" value={biz.curp || t('No proporcionado', 'Not provided')} />
            <InfoRow icon={CreditCard} label="CLABE" value={biz.clabe || t('No proporcionada', 'Not provided')} />
            <InfoRow icon={FileText} label={t('Razon Social', 'Legal Name')} value={biz.legal_name || t('No proporcionado', 'Not provided')} />
            {biz.ine_url && (
              <div className="flex items-center gap-2 py-1.5">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground w-28 shrink-0">INE</span>
                <a href={biz.ine_url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1" data-testid="ine-link">
                  {t('Ver documento', 'View document')} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {biz.rfc_document_url && (
              <div className="flex items-center gap-2 py-1.5">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground w-28 shrink-0">{t('Doc. RFC', 'RFC Doc')}</span>
                <a href={biz.rfc_document_url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1" data-testid="rfc-doc-link">
                  {t('Ver documento', 'View document')} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* Subscription */}
            <SectionTitle>{t('Suscripcion', 'Subscription')}</SectionTitle>
            <InfoRow icon={CreditCard} label={t('Estado', 'Status')} value={biz.subscription_status || 'none'} />
            <InfoRow icon={Calendar} label={t('Inicio', 'Started')} value={biz.subscription_started_at ? formatDate(biz.subscription_started_at, language === 'es' ? 'es-MX' : 'en-US') : '-'} />
            <InfoRow icon={CreditCard} label="Stripe Sub ID" value={biz.subscription_id || '-'} />

            {/* Owner */}
            {owner && (
              <>
                <SectionTitle>{t('Propietario', 'Owner')}</SectionTitle>
                <InfoRow icon={Users} label={t('Nombre', 'Name')} value={owner.full_name} />
                <InfoRow icon={Mail} label="Email" value={owner.email} />
                <InfoRow icon={Phone} label={t('Telefono', 'Phone')} value={owner.phone} />
                <InfoRow icon={CheckCircle2} label={t('Email verificado', 'Email verified')} value={owner.email_verified ? t('Si', 'Yes') : t('No', 'No')} />
              </>
            )}

            {/* Services */}
            {detail?.services?.length > 0 && (
              <>
                <SectionTitle>{t('Servicios', 'Services')} ({detail.services.length})</SectionTitle>
                <div className="grid gap-2">
                  {detail.services.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                      <span>{s.name}</span>
                      <div className="flex gap-3 text-muted-foreground">
                        <span>{formatCurrency(s.price)}</span>
                        <span>{s.duration} min</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Workers */}
            {detail?.workers?.length > 0 && (
              <>
                <SectionTitle>{t('Trabajadores', 'Workers')} ({detail.workers.length})</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {detail.workers.map(w => (
                    <Badge key={w.id} variant="outline">{w.name}</Badge>
                  ))}
                </div>
              </>
            )}

            {/* Recent reviews */}
            {detail?.reviews?.length > 0 && (
              <>
                <SectionTitle>{t('Resenas Recientes', 'Recent Reviews')} ({stats?.review_count})</SectionTitle>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {detail.reviews.slice(0, 5).map((r, i) => (
                    <div key={i} className="p-2 rounded-lg bg-muted/50 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{r.user_name || 'Anonimo'}</span>
                        <div className="flex items-center gap-1 text-amber-500">
                          <Star className="h-3 w-3 fill-current" />{r.rating}
                        </div>
                      </div>
                      {r.comment && <p className="text-muted-foreground mt-1 line-clamp-2">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Footer actions */}
        {biz && (
          <DialogFooter className="gap-2 sm:gap-0">
            {biz.status === 'pending' && (
              <>
                <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => { onReject(biz.id); onClose(); }} data-testid="detail-reject-btn">
                  <XCircle className="h-4 w-4 mr-2" />{t('Rechazar', 'Reject')}
                </Button>
                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { onApprove(biz.id); onClose(); }} data-testid="detail-approve-btn">
                  <CheckCircle2 className="h-4 w-4 mr-2" />{t('Aprobar', 'Approve')}
                </Button>
              </>
            )}
            {biz.status === 'approved' && (
              <Badge className="bg-green-100 text-green-700 text-sm px-3 py-1">{t('Negocio Activo', 'Active Business')}</Badge>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Admin Page ─── */
export default function AdminDashboardPage() {
  const { t, language } = useI18n();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [pendingBusinesses, setPendingBusinesses] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Business detail dialog
  const [detailBizId, setDetailBizId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Businesses tab
  const [businesses, setBusinesses] = useState([]);
  const [bizTotal, setBizTotal] = useState(0);
  const [bizPage, setBizPage] = useState(1);
  const [bizPages, setBizPages] = useState(1);
  const [bizSearch, setBizSearch] = useState('');
  const [bizStatus, setBizStatus] = useState('');
  const [bizLoading, setBizLoading] = useState(false);

  // Users tab
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPages, setUsersPages] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);

  // Finance tab
  const [settlements, setSettlements] = useState([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);

  // Reviews tab
  const [reviews, setReviews] = useState([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsPages, setReviewsPages] = useState(1);
  const [reviewsSearch, setReviewsSearch] = useState('');
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Subscriptions tab
  const [subData, setSubData] = useState(null);
  const [subLoading, setSubLoading] = useState(false);

  // Growth stats
  const [growthData, setGrowthData] = useState([]);
  const [growthLoading, setGrowthLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) { navigate('/admin/login'); return; }
    if (!user?.totp_enabled) { navigate('/admin/login'); return; }
    loadOverview();
  }, [isAuthenticated, isAdmin, user]);

  const loadOverview = async () => {
    try {
      const [statsRes, pendingRes, logsRes] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getPendingBusinesses(),
        adminAPI.getAuditLogs({ page: 1, limit: 20 }),
      ]);
      setStats(statsRes.data);
      setPendingBusinesses(pendingRes.data);
      setAuditLogs(logsRes.data);
    } catch { /* silent */ }
    setLoading(false);
    // Load growth in background
    setGrowthLoading(true);
    try {
      const gRes = await adminAPI.getGrowthStats(12);
      setGrowthData(gRes.data);
    } catch { /* silent */ }
    setGrowthLoading(false);
  };

  const loadBusinesses = useCallback(async (page = 1) => {
    setBizLoading(true);
    try {
      const res = await adminAPI.getAllBusinesses({ search: bizSearch, status: bizStatus, page, limit: 20 });
      setBusinesses(res.data.businesses);
      setBizTotal(res.data.total);
      setBizPages(res.data.pages);
      setBizPage(page);
    } catch { /* silent */ }
    setBizLoading(false);
  }, [bizSearch, bizStatus]);

  const loadUsers = useCallback(async (page = 1) => {
    setUsersLoading(true);
    try {
      const res = await adminAPI.getAllUsers({ search: usersSearch, page, limit: 20 });
      setUsers(res.data.users);
      setUsersTotal(res.data.total);
      setUsersPages(res.data.pages);
      setUsersPage(page);
    } catch { /* silent */ }
    setUsersLoading(false);
  }, [usersSearch]);

  const loadFinance = async () => {
    setFinanceLoading(true);
    try {
      const res = await adminAPI.getSettlements({ page: 1, limit: 50 });
      setSettlements(res.data);
    } catch { /* silent */ }
    setFinanceLoading(false);
  };

  const loadReviews = useCallback(async (page = 1) => {
    setReviewsLoading(true);
    try {
      const res = await adminAPI.getAllReviews({ search: reviewsSearch, page, limit: 20 });
      setReviews(res.data.reviews);
      setReviewsTotal(res.data.total);
      setReviewsPages(res.data.pages);
      setReviewsPage(page);
    } catch { /* silent */ }
    setReviewsLoading(false);
  }, [reviewsSearch]);

  const loadSubscriptions = async () => {
    setSubLoading(true);
    try {
      const res = await adminAPI.getSubscriptions();
      setSubData(res.data);
    } catch { /* silent */ }
    setSubLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'businesses') loadBusinesses(1);
    if (activeTab === 'users') loadUsers(1);
    if (activeTab === 'finance') loadFinance();
    if (activeTab === 'reviews') loadReviews(1);
    if (activeTab === 'subscriptions') loadSubscriptions();
  }, [activeTab]);

  const openDetail = (id) => { setDetailBizId(id); setDetailOpen(true); };

  const handleApproveBusiness = async (id) => {
    try {
      await adminAPI.approveBusiness(id);
      toast.success(t('Negocio aprobado', 'Business approved'));
      loadOverview();
      if (activeTab === 'businesses') loadBusinesses(bizPage);
    } catch { toast.error(t('Error al aprobar', 'Error approving')); }
  };

  const handleRejectBusiness = async (id) => {
    const reason = window.prompt(t('Razon del rechazo:', 'Rejection reason:'));
    if (reason === null) return;
    try {
      await adminAPI.rejectBusiness(id, reason);
      toast.success(t('Negocio rechazado', 'Business rejected'));
      loadOverview();
      if (activeTab === 'businesses') loadBusinesses(bizPage);
    } catch { toast.error(t('Error al rechazar', 'Error rejecting')); }
  };

  const handleSuspendBusiness = async (id) => {
    const reason = window.prompt(t('Razon de la suspension:', 'Suspension reason:'));
    if (reason === null) return;
    try {
      await adminAPI.suspendBusiness(id, reason);
      toast.success(t('Negocio suspendido', 'Business suspended'));
      loadBusinesses(bizPage);
    } catch { toast.error(t('Error', 'Error')); }
  };

  const handleSuspendUser = async (id) => {
    const days = window.prompt(t('Dias de suspension:', 'Suspension days:'), '15');
    if (days === null) return;
    try {
      await adminAPI.suspendUser(id, parseInt(days), 'Admin suspension');
      toast.success(t('Usuario suspendido', 'User suspended'));
      loadUsers(usersPage);
    } catch { toast.error(t('Error', 'Error')); }
  };

  const handleDeleteReview = async (id) => {
    const reason = window.prompt(t('Razon de eliminacion:', 'Deletion reason:'));
    if (reason === null) return;
    try {
      await adminAPI.deleteReview(id, reason);
      toast.success(t('Resena eliminada', 'Review deleted'));
      loadReviews(reviewsPage);
    } catch { toast.error(t('Error', 'Error')); }
  };

  const handleExport = async (type) => {
    try {
      const res = type === 'transactions'
        ? await adminAPI.exportTransactions(exportYear, exportMonth)
        : await adminAPI.exportSettlements(exportYear, exportMonth);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${exportYear}_${exportMonth}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(t('Descargado', 'Downloaded'));
    } catch { toast.error(t('Error al exportar', 'Export error')); }
  };

  const handleGenerateSettlements = async () => {
    try {
      const res = await adminAPI.generateSettlements(exportYear, exportMonth);
      toast.success(res.data.message);
      loadFinance();
    } catch { toast.error(t('Error al generar', 'Error generating')); }
  };

  const handleMarkPaid = async (id) => {
    const ref = window.prompt(t('Referencia de pago (SPEI/transferencia):', 'Payment reference:'));
    if (!ref) return;
    try {
      await adminAPI.markSettlementPaid(id, ref);
      toast.success(t('Marcado como pagado', 'Marked as paid'));
      loadFinance();
    } catch { toast.error(t('Error', 'Error')); }
  };

  const tabs = [
    { id: 'overview', label: t('Resumen', 'Overview'), icon: BarChart3 },
    { id: 'businesses', label: t('Negocios', 'Businesses'), icon: Building2 },
    { id: 'users', label: t('Usuarios', 'Users'), icon: Users },
    { id: 'reviews', label: t('Resenas', 'Reviews'), icon: MessageSquare },
    { id: 'subscriptions', label: t('Suscripciones', 'Subscriptions'), icon: CreditCard },
    { id: 'finance', label: t('Finanzas', 'Finance'), icon: Wallet },
  ];

  if (loading) return (
    <div className="min-h-screen pt-20 bg-background">
      <div className="container-app py-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="grid md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="admin-dashboard-page">
      <div className="container-app py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-heading font-bold">Panel Admin</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-green-100 text-green-700"><Shield className="h-3 w-3 mr-1" />2FA {t('Activo', 'Active')}</Badge>
              <span className="text-sm text-muted-foreground">{user?.email}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-muted/50 p-1 rounded-xl overflow-x-auto" data-testid="admin-tabs">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`} data-testid={`admin-tab-${tab.id}`}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Business Detail Dialog */}
        <BusinessDetailDialog
          businessId={detailBizId}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onApprove={handleApproveBusiness}
          onReject={handleRejectBusiness}
          t={t}
          language={language}
        />

        {/* ============ OVERVIEW TAB ============ */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Users, color: 'text-blue-500', value: stats?.users?.total || 0, label: t('Usuarios', 'Users') },
                { icon: Building2, color: 'text-purple-500', value: stats?.businesses?.total || 0, label: t('Negocios', 'Businesses'), sub: `${stats?.businesses?.pending || 0} ${t('pendientes', 'pending')}` },
                { icon: Calendar, color: 'text-green-500', value: stats?.bookings?.this_month || 0, label: t('Reservas este mes', 'Bookings this month') },
                { icon: DollarSign, color: 'text-emerald-500', value: formatCurrency(stats?.revenue?.this_month || 0), label: t('Ingresos del mes', 'Monthly revenue'), isText: true },
              ].map((s, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <s.icon className={`h-8 w-8 ${s.color}`} />
                      <span className={`${s.isText ? 'text-2xl' : 'text-3xl'} font-bold`}>{s.value}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{s.label}</p>
                    {s.sub && <p className="text-xs text-yellow-600 mt-1">{s.sub}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Pending Businesses */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="font-heading flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-500" />{t('Negocios Pendientes', 'Pending Businesses')}
                  </CardTitle>
                  <Badge variant="outline">{pendingBusinesses.length}</Badge>
                </CardHeader>
                <CardContent>
                  {pendingBusinesses.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {pendingBusinesses.map(biz => (
                        <div key={biz.id} className="p-4 rounded-xl bg-muted/50" data-testid={`pending-business-${biz.id}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 cursor-pointer" onClick={() => openDetail(biz.id)}>
                              <h4 className="font-medium hover:text-primary transition-colors">{biz.name}</h4>
                              <p className="text-sm text-muted-foreground">{biz.email}</p>
                              <p className="text-sm text-muted-foreground">{biz.city}, {biz.state}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => openDetail(biz.id)} data-testid={`view-pending-${biz.id}`}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" className="text-green-600 hover:bg-green-50"
                                onClick={() => handleApproveBusiness(biz.id)} data-testid={`approve-${biz.id}`}>
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50"
                                onClick={() => handleRejectBusiness(biz.id)} data-testid={`reject-${biz.id}`}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">{t('No hay negocios pendientes', 'No pending businesses')}</p>
                  )}
                </CardContent>
              </Card>

              {/* Audit Logs */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-500" />{t('Logs de Auditoria', 'Audit Logs')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {auditLogs.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {auditLogs.map(log => (
                        <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className={`p-2 rounded-full ${
                            log.action.includes('approve') ? 'bg-green-100 text-green-600' :
                            log.action.includes('reject') || log.action.includes('suspend') ? 'bg-red-100 text-red-600' :
                            'bg-blue-100 text-blue-600'
                          }`}>
                            {log.action.includes('approve') ? <CheckCircle2 className="h-4 w-4" /> :
                             log.action.includes('reject') ? <XCircle className="h-4 w-4" /> :
                             log.action.includes('suspend') ? <Ban className="h-4 w-4" /> :
                             <FileText className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium capitalize">{log.action.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-muted-foreground truncate">ID: {log.target_id?.substring(0, 8)}...</p>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{formatDate(log.created_at, language === 'es' ? 'es-MX' : 'en-US')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">{t('No hay logs', 'No logs')}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ─── Growth Charts ─── */}
            <div data-testid="growth-charts-section">
              <h3 className="text-lg font-heading font-semibold flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-emerald-500" />{t('Estadisticas de Crecimiento', 'Growth Statistics')}
              </h3>
              {growthLoading ? (
                <div className="grid lg:grid-cols-2 gap-6">
                  <Skeleton className="h-72 rounded-xl" />
                  <Skeleton className="h-72 rounded-xl" />
                </div>
              ) : growthData.length > 0 ? (
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Negocios & Usuarios */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">{t('Registros por Mes', 'Monthly Registrations')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={growthData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ borderRadius: '8px', fontSize: '13px', border: '1px solid hsl(var(--border))' }}
                            labelStyle={{ fontWeight: 600 }}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                          <Bar dataKey="businesses" name={t('Negocios', 'Businesses')} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="users" name={t('Usuarios', 'Users')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Reservas */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">{t('Reservas por Mes', 'Monthly Bookings')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={growthData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <defs>
                            <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ borderRadius: '8px', fontSize: '13px', border: '1px solid hsl(var(--border))' }}
                            labelStyle={{ fontWeight: 600 }}
                          />
                          <Area type="monotone" dataKey="bookings" name={t('Reservas', 'Bookings')} stroke="#10b981" strokeWidth={2} fill="url(#colorBookings)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Ingresos */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">{t('Ingresos por Mes (MXN)', 'Monthly Revenue (MXN)')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={growthData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                          <Tooltip
                            contentStyle={{ borderRadius: '8px', fontSize: '13px', border: '1px solid hsl(var(--border))' }}
                            labelStyle={{ fontWeight: 600 }}
                            formatter={(v) => [`$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, t('Ingresos', 'Revenue')]}
                          />
                          <Area type="monotone" dataKey="revenue" name={t('Ingresos', 'Revenue')} stroke="#f59e0b" strokeWidth={2} fill="url(#colorRevenue)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    {t('No hay datos de crecimiento disponibles', 'No growth data available')}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                <CardContent className="p-4">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200">{t('Negocios Aprobados', 'Approved Businesses')}</h4>
                  <p className="text-3xl font-bold text-blue-600 mt-2">{stats?.businesses?.approved || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-900/20 border-green-200">
                <CardContent className="p-4">
                  <h4 className="font-medium text-green-800 dark:text-green-200">{t('Reservas Completadas', 'Completed Bookings')}</h4>
                  <p className="text-3xl font-bold text-green-600 mt-2">{stats?.bookings?.completed || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200">
                <CardContent className="p-4">
                  <h4 className="font-medium text-purple-800 dark:text-purple-200">{t('Total Reservas', 'Total Bookings')}</h4>
                  <p className="text-3xl font-bold text-purple-600 mt-2">{stats?.bookings?.total || 0}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ============ BUSINESSES TAB ============ */}
        {activeTab === 'businesses' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('Buscar por nombre, email o telefono...', 'Search by name, email or phone...')}
                  value={bizSearch} onChange={e => setBizSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadBusinesses(1)}
                  className="pl-10" data-testid="biz-search-input" />
              </div>
              <Select value={bizStatus} onValueChange={v => { setBizStatus(v === 'all' ? '' : v); }}>
                <SelectTrigger className="w-40" data-testid="biz-status-filter">
                  <SelectValue placeholder={t('Estado', 'Status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('Todos', 'All')}</SelectItem>
                  <SelectItem value="approved">{t('Aprobados', 'Approved')}</SelectItem>
                  <SelectItem value="pending">{t('Pendientes', 'Pending')}</SelectItem>
                  <SelectItem value="suspended">{t('Suspendidos', 'Suspended')}</SelectItem>
                  <SelectItem value="rejected">{t('Rechazados', 'Rejected')}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => loadBusinesses(1)} data-testid="biz-search-btn">
                <Search className="h-4 w-4 mr-2" />{t('Buscar', 'Search')}
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">{bizTotal} {t('negocios encontrados', 'businesses found')}</p>

            {bizLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
            ) : (
              <div className="space-y-3">
                {businesses.map(biz => (
                  <Card key={biz.id} className="hover:shadow-md transition-shadow" data-testid={`biz-row-${biz.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openDetail(biz.id)}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold hover:text-primary transition-colors">{biz.name}</h4>
                            <Badge className={STATUS_COLORS[biz.status] || 'bg-gray-100'}>{biz.status}</Badge>
                            {biz.subscription_status && (
                              <Badge variant="outline" className={STATUS_COLORS[biz.subscription_status] || ''}>
                                {biz.subscription_status === 'active' ? 'Suscripcion activa' :
                                 biz.subscription_status === 'trialing' ? 'Periodo de prueba' :
                                 biz.subscription_status === 'none' ? 'Sin suscripcion' : biz.subscription_status}
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm text-muted-foreground">
                            <span>{biz.email}</span>
                            <span>{biz.city}, {biz.state}</span>
                            <span>{biz.booking_count || 0} {t('reservas', 'bookings')}</span>
                            <span>{biz.review_count || 0} {t('resenas', 'reviews')}</span>
                          </div>
                          {biz.owner_email && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('Dueno', 'Owner')}: {biz.owner_name || biz.owner_email}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => openDetail(biz.id)} data-testid={`view-biz-${biz.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {biz.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" className="text-green-600 hover:bg-green-50"
                                onClick={() => handleApproveBusiness(biz.id)}>
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50"
                                onClick={() => handleRejectBusiness(biz.id)}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {biz.status === 'approved' && (
                            <Button size="sm" variant="outline" className="text-orange-600 hover:bg-orange-50"
                              onClick={() => handleSuspendBusiness(biz.id)}>
                              <Ban className="h-4 w-4 mr-1" />{t('Suspender', 'Suspend')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {businesses.length === 0 && (
                  <p className="text-center text-muted-foreground py-12">{t('No se encontraron negocios', 'No businesses found')}</p>
                )}
              </div>
            )}

            {bizPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <Button variant="outline" size="sm" disabled={bizPage <= 1} onClick={() => loadBusinesses(bizPage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{bizPage} / {bizPages}</span>
                <Button variant="outline" size="sm" disabled={bizPage >= bizPages} onClick={() => loadBusinesses(bizPage + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ============ USERS TAB ============ */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('Buscar por nombre, email o telefono...', 'Search by name, email or phone...')}
                  value={usersSearch} onChange={e => setUsersSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadUsers(1)}
                  className="pl-10" data-testid="users-search-input" />
              </div>
              <Button onClick={() => loadUsers(1)} data-testid="users-search-btn">
                <Search className="h-4 w-4 mr-2" />{t('Buscar', 'Search')}
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">{usersTotal} {t('usuarios encontrados', 'users found')}</p>

            {usersLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>
            ) : (
              <div className="space-y-2">
                {users.map(u => (
                  <Card key={u.id} data-testid={`user-row-${u.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium">{u.full_name || t('Sin nombre', 'No name')}</h4>
                            <Badge variant="outline" className="text-xs">{u.role === 'business' ? t('Negocio', 'Business') : t('Cliente', 'Client')}</Badge>
                            {u.suspended && <Badge className="bg-red-100 text-red-700">{t('Suspendido', 'Suspended')}</Badge>}
                            {u.google_id && <Badge variant="outline" className="text-xs">Google</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
                            <span>{u.email}</span>
                            {u.phone && <span>{u.phone}</span>}
                            <span>{u.booking_count || 0} {t('reservas', 'bookings')}</span>
                            {u.created_at && <span>{t('Registro', 'Joined')}: {formatDate(u.created_at, language === 'es' ? 'es-MX' : 'en-US')}</span>}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {!u.suspended && u.role !== 'business' && (
                            <Button size="sm" variant="outline" className="text-orange-600 hover:bg-orange-50"
                              onClick={() => handleSuspendUser(u.id)}>
                              <Ban className="h-4 w-4 mr-1" />{t('Suspender', 'Suspend')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {users.length === 0 && (
                  <p className="text-center text-muted-foreground py-12">{t('No se encontraron usuarios', 'No users found')}</p>
                )}
              </div>
            )}

            {usersPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <Button variant="outline" size="sm" disabled={usersPage <= 1} onClick={() => loadUsers(usersPage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{usersPage} / {usersPages}</span>
                <Button variant="outline" size="sm" disabled={usersPage >= usersPages} onClick={() => loadUsers(usersPage + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ============ REVIEWS TAB ============ */}
        {activeTab === 'reviews' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('Buscar por comentario o nombre...', 'Search by comment or name...')}
                  value={reviewsSearch} onChange={e => setReviewsSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadReviews(1)}
                  className="pl-10" data-testid="reviews-search-input" />
              </div>
              <Button onClick={() => loadReviews(1)} data-testid="reviews-search-btn">
                <Search className="h-4 w-4 mr-2" />{t('Buscar', 'Search')}
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">{reviewsTotal} {t('resenas encontradas', 'reviews found')}</p>

            {reviewsLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
            ) : (
              <div className="space-y-3">
                {reviews.map(r => (
                  <Card key={r.id} data-testid={`review-row-${r.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{r.user_name || t('Anonimo', 'Anonymous')}</span>
                            <div className="flex items-center gap-1 text-amber-500">
                              <Star className="h-4 w-4 fill-current" /><span className="font-bold">{r.rating}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">{r.business_name}</Badge>
                          </div>
                          {r.comment && <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{r.comment}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(r.created_at, language === 'es' ? 'es-MX' : 'en-US')}</p>
                        </div>
                        <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 shrink-0"
                          onClick={() => handleDeleteReview(r.id)} data-testid={`delete-review-${r.id}`}>
                          <Trash2 className="h-4 w-4 mr-1" />{t('Eliminar', 'Delete')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {reviews.length === 0 && (
                  <div className="text-center py-12">
                    <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">{t('No se encontraron resenas', 'No reviews found')}</p>
                  </div>
                )}
              </div>
            )}

            {reviewsPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <Button variant="outline" size="sm" disabled={reviewsPage <= 1} onClick={() => loadReviews(reviewsPage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{reviewsPage} / {reviewsPages}</span>
                <Button variant="outline" size="sm" disabled={reviewsPage >= reviewsPages} onClick={() => loadReviews(reviewsPage + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ============ SUBSCRIPTIONS TAB ============ */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-6">
            {subLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
            ) : subData ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: t('Activas', 'Active'), value: subData.summary?.active || 0, color: 'text-green-600 bg-green-50' },
                    { label: t('Prueba', 'Trial'), value: subData.summary?.trialing || 0, color: 'text-blue-600 bg-blue-50' },
                    { label: t('Sin suscripcion', 'None'), value: subData.summary?.none || 0, color: 'text-gray-600 bg-gray-50' },
                    { label: t('Vencidas', 'Past due'), value: subData.summary?.past_due || 0, color: 'text-red-600 bg-red-50' },
                  ].map((s, i) => (
                    <Card key={i} className={s.color.split(' ')[1]}>
                      <CardContent className="p-4 text-center">
                        <p className={`text-3xl font-bold ${s.color.split(' ')[0]}`}>{s.value}</p>
                        <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* List */}
                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-purple-500" />{t('Negocios con Suscripcion', 'Businesses with Subscription')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {subData.businesses?.length > 0 ? (
                      <div className="space-y-2 max-h-[500px] overflow-y-auto">
                        {subData.businesses.map(b => (
                          <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3 cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => openDetail(b.id)} data-testid={`sub-row-${b.id}`}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{b.name}</span>
                                <Badge className={STATUS_COLORS[b.subscription_status] || 'bg-gray-100'}>
                                  {b.subscription_status}
                                </Badge>
                              </div>
                              <div className="flex gap-3 text-sm text-muted-foreground mt-1">
                                <span>{b.email}</span>
                                {b.city && <span>{b.city}</span>}
                                {b.subscription_started_at && (
                                  <span>{t('Desde', 'Since')}: {formatDate(b.subscription_started_at, language === 'es' ? 'es-MX' : 'en-US')}</span>
                                )}
                              </div>
                            </div>
                            <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">{t('No hay suscripciones registradas', 'No subscriptions registered')}</p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-12">{t('Error al cargar suscripciones', 'Error loading subscriptions')}</p>
            )}
          </div>
        )}

        {/* ============ FINANCE TAB ============ */}
        {activeTab === 'finance' && (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('Ano', 'Year')}</label>
                    <Input type="number" value={exportYear} onChange={e => setExportYear(parseInt(e.target.value))} className="w-24" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('Mes', 'Month')}</label>
                    <Select value={String(exportMonth)} onValueChange={v => setExportMonth(parseInt(v))}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
                          <SelectItem key={i} value={String(i + 1)}>{language === 'es' ? m : ['January','February','March','April','May','June','July','August','September','October','November','December'][i]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={() => handleExport('transactions')} data-testid="export-transactions-btn">
                    <Download className="h-4 w-4 mr-2" />{t('Exportar transacciones', 'Export transactions')}
                  </Button>
                  <Button variant="outline" onClick={() => handleExport('settlements')} data-testid="export-settlements-btn">
                    <Download className="h-4 w-4 mr-2" />{t('Exportar liquidaciones', 'Export settlements')}
                  </Button>
                  <Button onClick={handleGenerateSettlements} data-testid="generate-settlements-btn">
                    <DollarSign className="h-4 w-4 mr-2" />{t('Generar liquidaciones', 'Generate settlements')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-heading flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-emerald-500" />{t('Liquidaciones', 'Settlements')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {financeLoading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>
                ) : settlements.length > 0 ? (
                  <div className="space-y-3">
                    {settlements.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 gap-3" data-testid={`settlement-${s.id}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{s.business_name || s.business_id?.substring(0, 8)}</p>
                            <Badge className={s.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                              {s.status === 'paid' ? t('Pagado', 'Paid') : t('Pendiente', 'Pending')}
                            </Badge>
                          </div>
                          <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                            <span>{t('Periodo', 'Period')}: {s.period_key}</span>
                            <span>{s.booking_count} {t('reservas', 'bookings')}</span>
                            <span>{t('Total', 'Total')}: {formatCurrency(s.total_amount)}</span>
                            <span>{t('Comision', 'Fee')}: {formatCurrency(s.fee_amount)}</span>
                            <span className="font-medium text-foreground">{t('Pagar', 'Payout')}: {formatCurrency(s.payout_amount)}</span>
                          </div>
                          {s.payout_reference && <p className="text-xs text-muted-foreground mt-1">Ref: {s.payout_reference}</p>}
                        </div>
                        {s.status !== 'paid' && (
                          <Button size="sm" className="btn-coral shrink-0" onClick={() => handleMarkPaid(s.id)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" />{t('Marcar pagado', 'Mark paid')}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Wallet className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">{t('No hay liquidaciones. Genera una para el periodo seleccionado.', 'No settlements. Generate one for the selected period.')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
