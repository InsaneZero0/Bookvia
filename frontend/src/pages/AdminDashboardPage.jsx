import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  CreditCard, Briefcase, MessageSquare, Trash2, ExternalLink, TrendingUp,
  Tags, Settings, LifeBuoy, Plus, Pencil, Send, X, AlertCircle,
  Trophy, Bell, Map, ToggleLeft, ToggleRight, FileBarChart, UserPlus, Key
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
  const [allCategories, setAllCategories] = useState([]);
  const [reassignCatId, setReassignCatId] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameEn, setNewCatNameEn] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  useEffect(() => {
    if (!open || !businessId) return;
    setLoading(true);
    setReassignCatId('');
    setShowNewCat(false);
    setNewCatName('');
    setNewCatNameEn('');
    Promise.all([
      adminAPI.getBusinessDetail(businessId),
      adminAPI.getCategories(),
    ]).then(([detailRes, catsRes]) => {
      setDetail(detailRes.data);
      setAllCategories(catsRes.data || []);
    }).catch(() => toast.error('Error loading detail'))
      .finally(() => setLoading(false));
  }, [open, businessId]);

  const reloadCategories = async () => {
    try {
      const res = await adminAPI.getCategories();
      setAllCategories(res.data || []);
    } catch { /* silent */ }
  };

  const handleReassign = async () => {
    if (!reassignCatId || !businessId) return;
    setReassigning(true);
    try {
      await adminAPI.reassignCategory(businessId, reassignCatId);
      toast.success(t('Categoria reasignada', 'Category reassigned'));
      const res = await adminAPI.getBusinessDetail(businessId);
      setDetail(res.data);
      setReassignCatId('');
    } catch { toast.error('Error'); }
    setReassigning(false);
  };

  const handleCreateAndAssign = async () => {
    if (!newCatName.trim() || !businessId) return;
    setCreatingCat(true);
    try {
      const slug = newCatName.toLowerCase().replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const catRes = await adminAPI.createCategory({ name_es: newCatName, name_en: newCatNameEn || newCatName, slug, icon: 'Sparkles' });
      const newCatId = catRes.data.id;
      await adminAPI.reassignCategory(businessId, newCatId);
      toast.success(t('Categoria creada y asignada', 'Category created and assigned'));
      const detailRes = await adminAPI.getBusinessDetail(businessId);
      setDetail(detailRes.data);
      await reloadCategories();
      setShowNewCat(false);
      setNewCatName('');
      setNewCatNameEn('');
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    setCreatingCat(false);
  };

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

            {/* Custom category description + reassign */}
            {biz.custom_category_description && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 mt-2">
                <p className="text-xs font-medium text-amber-800 mb-1">{t('Tipo de negocio solicitado', 'Requested business type')}:</p>
                <p className="text-sm font-semibold text-amber-900">{biz.custom_category_description}</p>
              </div>
            )}

            {/* Reassign category */}
            <div className="mt-2 space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Asignar categoria', 'Assign category')}</label>
                  <select
                    value={reassignCatId}
                    onChange={e => setReassignCatId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    data-testid="reassign-category-select"
                  >
                    <option value="">{t('Seleccionar existente...', 'Select existing...')}</option>
                    {allCategories.filter(c => c.id !== biz.category_id).map(c => (
                      <option key={c.id} value={c.id}>{c.name_es} ({c.name_en})</option>
                    ))}
                  </select>
                </div>
                <Button size="sm" onClick={handleReassign} disabled={!reassignCatId || reassigning} data-testid="reassign-category-btn">
                  {reassigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                </Button>
              </div>
              
              {/* Create new category inline */}
              {!showNewCat ? (
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setShowNewCat(true)} data-testid="new-category-inline-btn">
                  <Plus className="h-3 w-3 mr-1" />{t('Crear nueva categoria y asignar', 'Create new category and assign')}
                </Button>
              ) : (
                <div className="p-3 rounded-lg border bg-muted/30 space-y-2" data-testid="new-category-inline-form">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder={t('Nombre ES', 'Name ES')}
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      className="h-8 text-sm"
                      data-testid="new-cat-name-es"
                    />
                    <Input
                      placeholder={t('Nombre EN', 'Name EN')}
                      value={newCatNameEn}
                      onChange={e => setNewCatNameEn(e.target.value)}
                      className="h-8 text-sm"
                      data-testid="new-cat-name-en"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateAndAssign} disabled={!newCatName.trim() || creatingCat} className="flex-1 text-xs" data-testid="create-assign-btn">
                      {creatingCat ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                      {t('Crear y asignar', 'Create & assign')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowNewCat(false); setNewCatName(''); setNewCatNameEn(''); }} className="text-xs">
                      {t('Cancelar', 'Cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
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
  const { user, isAuthenticated, isAdmin, isSuperAdmin } = useAuth();
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

  // Categories tab
  const [categories, setCategories] = useState([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState({ name_es: '', name_en: '', slug: '', icon: '', image_url: '' });
  const [showCatForm, setShowCatForm] = useState(false);

  // Config tab
  const [platformConfig, setPlatformConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configForm, setConfigForm] = useState({});

  // Support tab
  const [tickets, setTickets] = useState([]);
  const [ticketsTotal, setTicketsTotal] = useState(0);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsPages, setTicketsPages] = useState(1);
  const [ticketsSearch, setTicketsSearch] = useState('');
  const [ticketsStatus, setTicketsStatus] = useState('');
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketStats, setTicketStats] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketReply, setTicketReply] = useState('');

  // Rankings tab
  const [rankings, setRankings] = useState(null);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  // Alerts
  const [alerts, setAlerts] = useState([]);
  const [alertsCount, setAlertsCount] = useState(0);

  // Cities tab
  const [cities, setCities] = useState([]);
  const [citiesTotal, setCitiesTotal] = useState(0);
  const [citiesPage, setCitiesPage] = useState(1);
  const [citiesPages, setCitiesPages] = useState(1);
  const [citiesSearch, setCitiesSearch] = useState('');
  const [citiesActive, setCitiesActive] = useState('');
  const [citiesLoading, setCitiesLoading] = useState(false);

  // Reports tab
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDateFrom, setReportDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [reportDateTo, setReportDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [reportCity, setReportCity] = useState('');
  const [reportCategory, setReportCategory] = useState('');

  // Staff tab
  const [staffList, setStaffList] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffForm, setStaffForm] = useState({ email: '', password: '', full_name: '', role_label: '', permissions: [] });
  const [myPermissions, setMyPermissions] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) { navigate('/bv-ctrl/login'); return; }
    // Super admin (role=admin) requires 2FA, staff does not
    if (isSuperAdmin && !user?.totp_enabled) { navigate('/bv-ctrl/login'); return; }
    loadOverview();
    loadMyPermissions();
  }, [isAuthenticated, isAdmin, isSuperAdmin, user]);

  const loadMyPermissions = async () => {
    try {
      const res = await adminAPI.getMyPermissions();
      setMyPermissions(res.data);
    } catch { /* silent */ }
  };

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
    // Load growth and alerts in background
    setGrowthLoading(true);
    try {
      const [gRes, aRes] = await Promise.all([
        adminAPI.getGrowthStats(12),
        adminAPI.getAlerts(),
      ]);
      setGrowthData(gRes.data);
      setAlerts(aRes.data.alerts);
      setAlertsCount(aRes.data.total);
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

  const loadCategories = async () => {
    setCatsLoading(true);
    try {
      const res = await adminAPI.getCategories();
      setCategories(res.data);
    } catch { /* silent */ }
    setCatsLoading(false);
  };

  const loadConfig = async () => {
    setConfigLoading(true);
    try {
      const res = await adminAPI.getConfig();
      setPlatformConfig(res.data);
      setConfigForm(res.data);
    } catch { /* silent */ }
    setConfigLoading(false);
  };

  const loadTickets = useCallback(async (page = 1) => {
    setTicketsLoading(true);
    try {
      const [ticketsRes, statsRes] = await Promise.all([
        adminAPI.getTickets({ search: ticketsSearch, status: ticketsStatus, page, limit: 20 }),
        adminAPI.getTicketStats(),
      ]);
      setTickets(ticketsRes.data.tickets);
      setTicketsTotal(ticketsRes.data.total);
      setTicketsPages(ticketsRes.data.pages);
      setTicketsPage(page);
      setTicketStats(statsRes.data);
    } catch { /* silent */ }
    setTicketsLoading(false);
  }, [ticketsSearch, ticketsStatus]);

  const loadRankings = async () => {
    setRankingsLoading(true);
    try {
      const res = await adminAPI.getRankings();
      setRankings(res.data);
    } catch { /* silent */ }
    setRankingsLoading(false);
  };

  const loadAlerts = async () => {
    try {
      const res = await adminAPI.getAlerts();
      setAlerts(res.data.alerts);
      setAlertsCount(res.data.total);
    } catch { /* silent */ }
  };

  const loadCities = useCallback(async (page = 1) => {
    setCitiesLoading(true);
    try {
      const res = await adminAPI.getCities({ search: citiesSearch, active_only: citiesActive, page, limit: 50 });
      setCities(res.data.cities);
      setCitiesTotal(res.data.total);
      setCitiesPages(res.data.pages);
      setCitiesPage(page);
    } catch { /* silent */ }
    setCitiesLoading(false);
  }, [citiesSearch, citiesActive]);

  useEffect(() => {
    if (activeTab === 'businesses') loadBusinesses(1);
    if (activeTab === 'users') loadUsers(1);
    if (activeTab === 'finance') loadFinance();
    if (activeTab === 'reviews') loadReviews(1);
    if (activeTab === 'subscriptions') loadSubscriptions();
    if (activeTab === 'categories') loadCategories();
    if (activeTab === 'config') loadConfig();
    if (activeTab === 'support') loadTickets(1);
    if (activeTab === 'rankings') loadRankings();
    if (activeTab === 'cities') loadCities(1);
    if (activeTab === 'reports') loadReport();
    if (activeTab === 'staff') loadStaff();
  }, [activeTab]);

  const loadReport = async () => {
    setReportLoading(true);
    try {
      const res = await adminAPI.getCustomReport({ date_from: reportDateFrom, date_to: reportDateTo, city: reportCity, category: reportCategory });
      setReportData(res.data);
    } catch { /* silent */ }
    setReportLoading(false);
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const res = await adminAPI.getStaff();
      setStaffList(res.data.staff);
    } catch { /* silent */ }
    setStaffLoading(false);
  };

  const resetStaffForm = () => { setStaffForm({ email: '', password: '', full_name: '', role_label: '', permissions: [] }); setEditingStaff(null); setShowStaffForm(false); };
  const handleSaveStaff = async () => {
    try {
      if (editingStaff) {
        await adminAPI.updateStaff(editingStaff, { full_name: staffForm.full_name, role_label: staffForm.role_label, permissions: staffForm.permissions });
        toast.success(t('Staff actualizado', 'Staff updated'));
      } else {
        await adminAPI.createStaff(staffForm);
        toast.success(t('Staff creado', 'Staff created'));
      }
      resetStaffForm();
      loadStaff();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };
  const handleDeleteStaff = async (id, name) => {
    if (!window.confirm(t(`Eliminar a "${name}"?`, `Delete "${name}"?`))) return;
    try {
      await adminAPI.deleteStaff(id);
      toast.success(t('Staff eliminado', 'Staff deleted'));
      loadStaff();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };
  const handleResetStaffPassword = async (id) => {
    try {
      const res = await adminAPI.resetStaffPassword(id);
      toast.success(`${t('Contrasena temporal', 'Temp password')}: ${res.data.temporary_password}`);
    } catch { toast.error('Error'); }
  };
  const toggleStaffPerm = (perm) => {
    setStaffForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm) ? f.permissions.filter(p => p !== perm) : [...f.permissions, perm]
    }));
  };

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

  // Category handlers
  const resetCatForm = () => { setCatForm({ name_es: '', name_en: '', slug: '', icon: '', image_url: '' }); setEditingCat(null); setShowCatForm(false); };
  const startEditCat = (cat) => { setEditingCat(cat.id); setCatForm({ name_es: cat.name_es, name_en: cat.name_en, slug: cat.slug, icon: cat.icon, image_url: cat.image_url || '' }); setShowCatForm(true); };
  const handleSaveCat = async () => {
    try {
      if (editingCat) {
        await adminAPI.updateCategory(editingCat, catForm);
        toast.success(t('Categoria actualizada', 'Category updated'));
      } else {
        await adminAPI.createCategory(catForm);
        toast.success(t('Categoria creada', 'Category created'));
      }
      resetCatForm();
      loadCategories();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };
  const handleDeleteCat = async (id, name) => {
    if (!window.confirm(t(`Eliminar "${name}"?`, `Delete "${name}"?`))) return;
    try {
      await adminAPI.deleteCategory(id);
      toast.success(t('Categoria eliminada', 'Category deleted'));
      loadCategories();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };
  const autoSlug = (name) => name.toLowerCase().replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Config handler
  const handleSaveConfig = async () => {
    try {
      const res = await adminAPI.updateConfig(configForm);
      setPlatformConfig(res.data);
      toast.success(t('Configuracion guardada', 'Configuration saved'));
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  // Ticket handlers
  const handleOpenTicket = async (id) => {
    try {
      const res = await adminAPI.getTicketDetail(id);
      setSelectedTicket(res.data);
      setTicketReply('');
    } catch { toast.error('Error'); }
  };
  const handleReplyTicket = async () => {
    if (!ticketReply.trim() || !selectedTicket) return;
    try {
      await adminAPI.respondToTicket(selectedTicket.id, ticketReply);
      toast.success(t('Respuesta enviada', 'Reply sent'));
      setTicketReply('');
      handleOpenTicket(selectedTicket.id);
      loadTickets(ticketsPage);
    } catch { toast.error('Error'); }
  };
  const handleCloseTicket = async (id) => {
    try {
      await adminAPI.closeTicket(id);
      toast.success(t('Ticket cerrado', 'Ticket closed'));
      setSelectedTicket(null);
      loadTickets(ticketsPage);
    } catch { toast.error('Error'); }
  };

  const handleToggleCity = async (slug, currentActive) => {
    try {
      await adminAPI.toggleCity(slug, !currentActive);
      toast.success(!currentActive ? t('Ciudad activada', 'City activated') : t('Ciudad desactivada', 'City deactivated'));
      loadCities(citiesPage);
    } catch { toast.error('Error'); }
  };

  const hasTabPerm = (tabId) => {
    if (!myPermissions) return true; // Loading state
    if (myPermissions.is_super_admin) return true;
    if (tabId === 'staff') return false; // Only super admin
    return myPermissions.permissions?.includes(tabId);
  };

  const allTabs = [
    { id: 'overview', label: t('Resumen', 'Overview'), icon: BarChart3 },
    { id: 'businesses', label: t('Negocios', 'Businesses'), icon: Building2 },
    { id: 'users', label: t('Usuarios', 'Users'), icon: Users },
    { id: 'reviews', label: t('Resenas', 'Reviews'), icon: MessageSquare },
    { id: 'categories', label: t('Categorias', 'Categories'), icon: Tags },
    { id: 'rankings', label: t('Rankings', 'Rankings'), icon: Trophy },
    { id: 'cities', label: t('Ciudades', 'Cities'), icon: Map },
    { id: 'config', label: t('Configuracion', 'Config'), icon: Settings },
    { id: 'support', label: alertsCount > 0 ? `${t('Soporte', 'Support')} (${alertsCount})` : t('Soporte', 'Support'), icon: LifeBuoy },
    { id: 'reports', label: t('Reportes', 'Reports'), icon: FileBarChart },
    { id: 'subscriptions', label: t('Suscripciones', 'Subscriptions'), icon: CreditCard },
    { id: 'finance', label: t('Finanzas', 'Finance'), icon: Wallet },
    ...(isSuperAdmin ? [{ id: 'staff', label: t('Equipo', 'Team'), icon: UserPlus }] : []),
  ];
  const tabs = allTabs.filter(tab => hasTabPerm(tab.id));

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
            {/* Alerts */}
            {alerts.length > 0 && (
              <Card data-testid="admin-alerts-section">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading flex items-center gap-2">
                    <Bell className="h-5 w-5 text-amber-500" />{t('Alertas', 'Alerts')}
                    <Badge className="bg-amber-100 text-amber-700">{alerts.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {alerts.map((a, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                        a.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/10' :
                        a.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-900/10' :
                        'bg-blue-50 dark:bg-blue-900/10'
                      }`} data-testid={`alert-${a.type}`}>
                        <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${
                          a.severity === 'critical' ? 'text-red-500' :
                          a.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{a.title}</p>
                          <p className="text-xs text-muted-foreground">{a.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

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

        {/* ============ CATEGORIES TAB ============ */}
        {activeTab === 'categories' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-heading font-semibold flex items-center gap-2">
                <Tags className="h-5 w-5 text-purple-500" />{t('Gestionar Categorias', 'Manage Categories')}
              </h3>
              <Button onClick={() => { resetCatForm(); setShowCatForm(true); }} data-testid="add-category-btn">
                <Plus className="h-4 w-4 mr-2" />{t('Nueva Categoria', 'New Category')}
              </Button>
            </div>

            {/* Inline form */}
            {showCatForm && (
              <Card data-testid="category-form">
                <CardContent className="p-4 space-y-3">
                  <h4 className="font-medium">{editingCat ? t('Editar Categoria', 'Edit Category') : t('Nueva Categoria', 'New Category')}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('Nombre (ES)', 'Name (ES)')}</label>
                      <Input value={catForm.name_es} onChange={e => { setCatForm(f => ({ ...f, name_es: e.target.value, slug: editingCat ? f.slug : autoSlug(e.target.value) })); }} data-testid="cat-name-es" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('Nombre (EN)', 'Name (EN)')}</label>
                      <Input value={catForm.name_en} onChange={e => setCatForm(f => ({ ...f, name_en: e.target.value }))} data-testid="cat-name-en" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Slug</label>
                      <Input value={catForm.slug} onChange={e => setCatForm(f => ({ ...f, slug: e.target.value }))} data-testid="cat-slug" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('Icono (Lucide)', 'Icon (Lucide)')}</label>
                      <Input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} placeholder="Sparkles, Heart, Car..." data-testid="cat-icon" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium mb-1 block">{t('URL de imagen', 'Image URL')}</label>
                      <Input value={catForm.image_url} onChange={e => setCatForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://..." data-testid="cat-image" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSaveCat} disabled={!catForm.name_es || !catForm.slug} data-testid="save-category-btn">
                      <CheckCircle2 className="h-4 w-4 mr-2" />{editingCat ? t('Guardar', 'Save') : t('Crear', 'Create')}
                    </Button>
                    <Button variant="outline" onClick={resetCatForm}><X className="h-4 w-4 mr-2" />{t('Cancelar', 'Cancel')}</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Categories list */}
            {catsLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>
            ) : (
              <div className="space-y-2">
                {categories.map(cat => (
                  <Card key={cat.id} data-testid={`cat-row-${cat.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground shrink-0">
                            {cat.icon?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{cat.name_es}</span>
                              <span className="text-sm text-muted-foreground">/ {cat.name_en}</span>
                              {cat.active === false && <Badge className="bg-red-100 text-red-700 text-xs">{t('Inactiva', 'Inactive')}</Badge>}
                            </div>
                            <div className="flex gap-3 text-sm text-muted-foreground">
                              <span>slug: {cat.slug}</span>
                              <span>icon: {cat.icon}</span>
                              <span>{cat.business_count || 0} {t('negocios', 'businesses')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => startEditCat(cat)} data-testid={`edit-cat-${cat.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteCat(cat.id, cat.name_es)} data-testid={`delete-cat-${cat.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {categories.length === 0 && (
                  <p className="text-center text-muted-foreground py-12">{t('No hay categorias', 'No categories')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============ CONFIG TAB ============ */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            <h3 className="text-lg font-heading font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-500" />{t('Configuracion de la Plataforma', 'Platform Configuration')}
            </h3>
            {configLoading ? (
              <Skeleton className="h-64" />
            ) : platformConfig ? (
              <Card data-testid="platform-config-form">
                <CardContent className="p-6 space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('Comision de plataforma (%)', 'Platform fee (%)')}</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" step="0.01" min="0" max="50"
                          value={(configForm.platform_fee_percent ?? 0.08) * 100}
                          onChange={e => setConfigForm(f => ({ ...f, platform_fee_percent: parseFloat(e.target.value) / 100 }))}
                          className="w-28" data-testid="config-fee" />
                        <span className="text-sm text-muted-foreground">%</span>
                        <span className="text-xs text-muted-foreground ml-2">{t('Actual', 'Current')}: {((platformConfig.platform_fee_percent || 0.08) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('Precio suscripcion (MXN)', 'Subscription price (MXN)')}</label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">$</span>
                        <Input type="number" step="1" min="0"
                          value={configForm.subscription_price_mxn ?? 39}
                          onChange={e => setConfigForm(f => ({ ...f, subscription_price_mxn: parseFloat(e.target.value) }))}
                          className="w-28" data-testid="config-price" />
                        <span className="text-sm text-muted-foreground">MXN</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('Dias de prueba', 'Trial days')}</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min="0"
                          value={configForm.subscription_trial_days ?? 30}
                          onChange={e => setConfigForm(f => ({ ...f, subscription_trial_days: parseInt(e.target.value) }))}
                          className="w-28" data-testid="config-trial" />
                        <span className="text-sm text-muted-foreground">{t('dias', 'days')}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('Deposito minimo (MXN)', 'Min deposit (MXN)')}</label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">$</span>
                        <Input type="number" step="10" min="0"
                          value={configForm.min_deposit_amount ?? 50}
                          onChange={e => setConfigForm(f => ({ ...f, min_deposit_amount: parseFloat(e.target.value) }))}
                          className="w-28" data-testid="config-deposit" />
                        <span className="text-sm text-muted-foreground">MXN</span>
                      </div>
                    </div>
                  </div>
                  {platformConfig.updated_at && (
                    <p className="text-xs text-muted-foreground">
                      {t('Ultima modificacion', 'Last modified')}: {formatDate(platformConfig.updated_at, language === 'es' ? 'es-MX' : 'en-US')} - {platformConfig.updated_by}
                    </p>
                  )}
                  <Button onClick={handleSaveConfig} data-testid="save-config-btn">
                    <CheckCircle2 className="h-4 w-4 mr-2" />{t('Guardar Configuracion', 'Save Configuration')}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <p className="text-center text-muted-foreground py-12">{t('Error al cargar', 'Error loading')}</p>
            )}
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t('Nota importante', 'Important note')}</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      {t('Los cambios de precio y comision aplican a nuevas transacciones. Las suscripciones existentes en Stripe no se modifican automaticamente.',
                         'Price and fee changes apply to new transactions. Existing Stripe subscriptions are not automatically modified.')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ SUPPORT TAB ============ */}
        {activeTab === 'support' && (
          <div className="space-y-4">
            {/* Stats */}
            {ticketStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: t('Abiertos', 'Open'), value: ticketStats.open, color: 'text-red-600 bg-red-50' },
                  { label: t('En progreso', 'In progress'), value: ticketStats.in_progress, color: 'text-blue-600 bg-blue-50' },
                  { label: t('Cerrados', 'Closed'), value: ticketStats.closed, color: 'text-green-600 bg-green-50' },
                  { label: t('Total', 'Total'), value: ticketStats.total, color: 'text-gray-600 bg-gray-50' },
                ].map((s, i) => (
                  <Card key={i} className={s.color.split(' ')[1]}>
                    <CardContent className="p-3 text-center">
                      <p className={`text-2xl font-bold ${s.color.split(' ')[0]}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('Buscar por asunto o email...', 'Search by subject or email...')}
                  value={ticketsSearch} onChange={e => setTicketsSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadTickets(1)}
                  className="pl-10" data-testid="tickets-search-input" />
              </div>
              <Select value={ticketsStatus} onValueChange={v => { setTicketsStatus(v === 'all' ? '' : v); }}>
                <SelectTrigger className="w-40" data-testid="tickets-status-filter">
                  <SelectValue placeholder={t('Estado', 'Status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('Todos', 'All')}</SelectItem>
                  <SelectItem value="open">{t('Abiertos', 'Open')}</SelectItem>
                  <SelectItem value="in_progress">{t('En progreso', 'In progress')}</SelectItem>
                  <SelectItem value="closed">{t('Cerrados', 'Closed')}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => loadTickets(1)} data-testid="tickets-search-btn">
                <Search className="h-4 w-4 mr-2" />{t('Buscar', 'Search')}
              </Button>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Tickets list */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{ticketsTotal} {t('tickets', 'tickets')}</p>
                {ticketsLoading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
                ) : (
                  <>
                    {tickets.map(tk => (
                      <Card key={tk.id} className={`cursor-pointer transition-shadow hover:shadow-md ${selectedTicket?.id === tk.id ? 'ring-2 ring-primary' : ''}`}
                        onClick={() => handleOpenTicket(tk.id)} data-testid={`ticket-row-${tk.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm line-clamp-1">{tk.subject}</span>
                                <Badge className={tk.status === 'open' ? 'bg-red-100 text-red-700' : tk.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}>
                                  {tk.status === 'open' ? t('Abierto', 'Open') : tk.status === 'in_progress' ? t('En progreso', 'In progress') : t('Cerrado', 'Closed')}
                                </Badge>
                              </div>
                              <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                                <span>{tk.user_name || tk.user_email}</span>
                                {tk.business_name && <span>{tk.business_name}</span>}
                                <span>{formatDate(tk.created_at, language === 'es' ? 'es-MX' : 'en-US')}</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0">{tk.category}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {tickets.length === 0 && (
                      <div className="text-center py-12">
                        <LifeBuoy className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground">{t('No hay tickets de soporte', 'No support tickets')}</p>
                      </div>
                    )}
                  </>
                )}
                {ticketsPages > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <Button variant="outline" size="sm" disabled={ticketsPage <= 1} onClick={() => loadTickets(ticketsPage - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">{ticketsPage} / {ticketsPages}</span>
                    <Button variant="outline" size="sm" disabled={ticketsPage >= ticketsPages} onClick={() => loadTickets(ticketsPage + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Ticket detail / conversation */}
              <div>
                {selectedTicket ? (
                  <Card data-testid="ticket-detail-panel">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{selectedTicket.subject}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {selectedTicket.user_name} ({selectedTicket.user_email})
                            {selectedTicket.business_name && ` — ${selectedTicket.business_name}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {selectedTicket.status !== 'closed' && (
                            <Button size="sm" variant="outline" onClick={() => handleCloseTicket(selectedTicket.id)} data-testid="close-ticket-btn">
                              <CheckCircle2 className="h-4 w-4 mr-1" />{t('Cerrar', 'Close')}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setSelectedTicket(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Messages */}
                      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {selectedTicket.messages?.map((msg, i) => (
                          <div key={i} className={`p-3 rounded-lg text-sm ${msg.sender === 'admin' ? 'bg-blue-50 dark:bg-blue-900/20 ml-6' : 'bg-muted/50 mr-6'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-xs">
                                {msg.sender === 'admin' ? t('Admin', 'Admin') : msg.sender_name || t('Usuario', 'User')}
                              </span>
                              <span className="text-xs text-muted-foreground">{formatDate(msg.created_at, language === 'es' ? 'es-MX' : 'en-US')}</span>
                            </div>
                            <p className="whitespace-pre-wrap">{msg.message}</p>
                          </div>
                        ))}
                      </div>
                      {/* Reply box */}
                      {selectedTicket.status !== 'closed' && (
                        <div className="flex gap-2 pt-2 border-t">
                          <Textarea placeholder={t('Escribe tu respuesta...', 'Write your reply...')}
                            value={ticketReply} onChange={e => setTicketReply(e.target.value)}
                            className="min-h-[80px]" data-testid="ticket-reply-input" />
                          <Button className="shrink-0 self-end" onClick={handleReplyTicket} disabled={!ticketReply.trim()} data-testid="send-reply-btn">
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {selectedTicket.status === 'closed' && (
                        <p className="text-center text-sm text-muted-foreground py-2 border-t">{t('Este ticket esta cerrado', 'This ticket is closed')}</p>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                      <LifeBuoy className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p>{t('Selecciona un ticket para ver los detalles', 'Select a ticket to see details')}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============ RANKINGS TAB ============ */}
        {activeTab === 'rankings' && (
          <div className="space-y-6">
            {rankingsLoading ? (
              <div className="grid md:grid-cols-2 gap-6">{[1,2,3,4].map(i => <Skeleton key={i} className="h-64" />)}</div>
            ) : rankings ? (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Top by bookings */}
                <Card data-testid="top-by-bookings">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-heading flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-amber-500" />{t('Top por Reservas', 'Top by Bookings')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {rankings.top_by_bookings?.map((b, i) => (
                        <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(b.id)}>
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'
                          }`}>{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{b.name}</p>
                            <p className="text-xs text-muted-foreground">{b.city}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0">{b.booking_count} {t('reservas', 'bookings')}</Badge>
                        </div>
                      ))}
                      {(!rankings.top_by_bookings || rankings.top_by_bookings.length === 0) && (
                        <p className="text-center text-muted-foreground py-4 text-sm">{t('Sin datos', 'No data')}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Top by rating */}
                <Card data-testid="top-by-rating">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-heading flex items-center gap-2">
                      <Star className="h-5 w-5 text-amber-500" />{t('Mejor Calificados', 'Top Rated')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {rankings.top_by_rating?.map((b, i) => (
                        <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(b.id)}>
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'
                          }`}>{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{b.name}</p>
                            <p className="text-xs text-muted-foreground">{b.city}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span className="text-sm font-medium">{b.rating?.toFixed(1)}</span>
                            <span className="text-xs text-muted-foreground">({b.review_count})</span>
                          </div>
                        </div>
                      ))}
                      {(!rankings.top_by_rating || rankings.top_by_rating.length === 0) && (
                        <p className="text-center text-muted-foreground py-4 text-sm">{t('Sin resenas suficientes', 'Not enough reviews')}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Top cities */}
                <Card data-testid="top-cities">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-heading flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-blue-500" />{t('Ciudades mas Activas', 'Most Active Cities')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {rankings.top_cities?.map((c, i) => (
                        <div key={c.city} className="flex items-center gap-3 p-2 rounded-lg">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            i === 0 ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'
                          }`}>{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{c.city}</p>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                            <span>{c.businesses} {t('negocios', 'businesses')}</span>
                            <span>{c.bookings} {t('reservas', 'bookings')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Top categories */}
                <Card data-testid="top-categories">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-heading flex items-center gap-2">
                      <Tags className="h-5 w-5 text-purple-500" />{t('Categorias Populares', 'Popular Categories')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {rankings.top_categories?.map((c, i) => (
                        <div key={c.category} className="flex items-center gap-3 p-2 rounded-lg">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            i === 0 ? 'bg-purple-100 text-purple-700' : 'bg-muted text-muted-foreground'
                          }`}>{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{c.category || t('Sin categoria', 'No category')}</p>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                            <span>{c.businesses} {t('negocios', 'businesses')}</span>
                            <span>{c.bookings} {t('reservas', 'bookings')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-12">{t('Error al cargar rankings', 'Error loading rankings')}</p>
            )}
          </div>
        )}

        {/* ============ CITIES TAB ============ */}
        {activeTab === 'cities' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('Buscar ciudad o estado...', 'Search city or state...')}
                  value={citiesSearch} onChange={e => setCitiesSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadCities(1)}
                  className="pl-10" data-testid="cities-search-input" />
              </div>
              <Select value={citiesActive} onValueChange={v => setCitiesActive(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-40" data-testid="cities-active-filter">
                  <SelectValue placeholder={t('Estado', 'Status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('Todas', 'All')}</SelectItem>
                  <SelectItem value="true">{t('Activas', 'Active')}</SelectItem>
                  <SelectItem value="false">{t('Inactivas', 'Inactive')}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => loadCities(1)} data-testid="cities-search-btn">
                <Search className="h-4 w-4 mr-2" />{t('Buscar', 'Search')}
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">{citiesTotal} {t('ciudades', 'cities')}</p>

            {citiesLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14" />)}</div>
            ) : (
              <div className="grid gap-2">
                {cities.map(c => (
                  <Card key={c.slug} data-testid={`city-row-${c.slug}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{c.name}</span>
                              <span className="text-xs text-muted-foreground">{c.state}</span>
                              {c.active === false && <Badge className="bg-red-100 text-red-700 text-xs">{t('Inactiva', 'Inactive')}</Badge>}
                              {c.active !== false && <Badge className="bg-green-100 text-green-700 text-xs">{t('Activa', 'Active')}</Badge>}
                            </div>
                            <div className="flex gap-3 text-xs text-muted-foreground">
                              <span>{c.country_code}</span>
                              <span>{c.business_count || 0} {t('negocios', 'businesses')}</span>
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="outline"
                          className={c.active !== false ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}
                          onClick={() => handleToggleCity(c.slug, c.active !== false)}
                          data-testid={`toggle-city-${c.slug}`}>
                          {c.active !== false ? (
                            <><ToggleRight className="h-4 w-4 mr-1" />{t('Desactivar', 'Deactivate')}</>
                          ) : (
                            <><ToggleLeft className="h-4 w-4 mr-1" />{t('Activar', 'Activate')}</>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {cities.length === 0 && (
                  <p className="text-center text-muted-foreground py-12">{t('No se encontraron ciudades', 'No cities found')}</p>
                )}
              </div>
            )}

            {citiesPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <Button variant="outline" size="sm" disabled={citiesPage <= 1} onClick={() => loadCities(citiesPage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{citiesPage} / {citiesPages}</span>
                <Button variant="outline" size="sm" disabled={citiesPage >= citiesPages} onClick={() => loadCities(citiesPage + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ============ REPORTS TAB ============ */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            {/* Filters */}
            <Card data-testid="report-filters">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('Desde', 'From')}</label>
                    <Input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)} className="w-40" data-testid="report-date-from" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('Hasta', 'To')}</label>
                    <Input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)} className="w-40" data-testid="report-date-to" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('Ciudad', 'City')}</label>
                    <Input value={reportCity} onChange={e => setReportCity(e.target.value)} placeholder={t('Todas', 'All')} className="w-40" data-testid="report-city" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('Categoria', 'Category')}</label>
                    <Input value={reportCategory} onChange={e => setReportCategory(e.target.value)} placeholder={t('Todas', 'All')} className="w-40" data-testid="report-category" />
                  </div>
                  <Button onClick={loadReport} data-testid="generate-report-btn">
                    <FileBarChart className="h-4 w-4 mr-2" />{t('Generar Reporte', 'Generate Report')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {reportLoading ? (
              <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}</div>
            ) : reportData ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="report-summary">
                  {[
                    { label: t('Total Reservas', 'Total Bookings'), value: reportData.summary.total_bookings, color: 'text-blue-600' },
                    { label: t('Completadas', 'Completed'), value: reportData.summary.completed, color: 'text-green-600' },
                    { label: t('Canceladas', 'Cancelled'), value: `${reportData.summary.cancelled} (${reportData.summary.cancel_rate}%)`, color: 'text-red-600' },
                    { label: t('Ingresos', 'Revenue'), value: formatCurrency(reportData.summary.revenue), color: 'text-emerald-600' },
                    { label: t('Usuarios Unicos', 'Unique Users'), value: reportData.summary.unique_users, color: 'text-purple-600' },
                  ].map((s, i) => (
                    <Card key={i}>
                      <CardContent className="p-3 text-center">
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Growth stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-blue-50 dark:bg-blue-900/10">
                    <CardContent className="p-3 text-center">
                      <p className="text-lg font-bold text-blue-600">{reportData.summary.new_users}</p>
                      <p className="text-xs text-muted-foreground">{t('Nuevos usuarios', 'New users')}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-purple-50 dark:bg-purple-900/10">
                    <CardContent className="p-3 text-center">
                      <p className="text-lg font-bold text-purple-600">{reportData.summary.new_businesses}</p>
                      <p className="text-xs text-muted-foreground">{t('Nuevos negocios', 'New businesses')}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50 dark:bg-green-900/10">
                    <CardContent className="p-3 text-center">
                      <p className="text-lg font-bold text-green-600">{reportData.summary.unique_businesses}</p>
                      <p className="text-xs text-muted-foreground">{t('Negocios activos', 'Active businesses')}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-amber-50 dark:bg-amber-900/10">
                    <CardContent className="p-3 text-center">
                      <p className="text-lg font-bold text-amber-600">{reportData.summary.confirmed}</p>
                      <p className="text-xs text-muted-foreground">{t('Confirmadas', 'Confirmed')}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Daily chart */}
                {reportData.daily_chart?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">{t('Reservas e Ingresos por Dia', 'Daily Bookings & Revenue')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={reportData.daily_chart} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid hsl(var(--border))' }} />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="bookings" name={t('Reservas', 'Bookings')} fill="#3b82f6" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="revenue" name={t('Ingresos', 'Revenue')} fill="#10b981" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Top businesses + top cities */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card data-testid="report-top-businesses">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">{t('Top Negocios en Periodo', 'Top Businesses in Period')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {reportData.top_businesses?.map((b, i) => (
                          <div key={b.business_id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{b.name}</p>
                                <p className="text-xs text-muted-foreground">{b.city}</p>
                              </div>
                            </div>
                            <Badge variant="outline">{b.bookings} {t('reservas', 'bookings')}</Badge>
                          </div>
                        ))}
                        {(!reportData.top_businesses || reportData.top_businesses.length === 0) && (
                          <p className="text-center text-muted-foreground text-sm py-4">{t('Sin datos', 'No data')}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  <Card data-testid="report-top-cities">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">{t('Top Ciudades en Periodo', 'Top Cities in Period')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {reportData.top_cities?.map((c, i) => (
                          <div key={c.city} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                              <span className="text-sm font-medium">{c.city}</span>
                            </div>
                            <Badge variant="outline">{c.bookings} {t('reservas', 'bookings')}</Badge>
                          </div>
                        ))}
                        {(!reportData.top_cities || reportData.top_cities.length === 0) && (
                          <p className="text-center text-muted-foreground text-sm py-4">{t('Sin datos', 'No data')}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <FileBarChart className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>{t('Selecciona un rango de fechas y genera un reporte', 'Select a date range and generate a report')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ============ STAFF TAB ============ */}
        {activeTab === 'staff' && isSuperAdmin && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-heading font-semibold flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-500" />{t('Gestion de Equipo', 'Team Management')}
              </h3>
              <Button onClick={() => { resetStaffForm(); setShowStaffForm(true); }} data-testid="add-staff-btn">
                <Plus className="h-4 w-4 mr-2" />{t('Nuevo miembro', 'New member')}
              </Button>
            </div>

            {/* Staff form */}
            {showStaffForm && (
              <Card data-testid="staff-form">
                <CardContent className="p-4 space-y-4">
                  <h4 className="font-medium">{editingStaff ? t('Editar miembro', 'Edit member') : t('Nuevo miembro de equipo', 'New team member')}</h4>
                  <div className="grid md:grid-cols-3 gap-3">
                    {!editingStaff && (
                      <>
                        <div>
                          <label className="text-sm font-medium mb-1 block">Email</label>
                          <Input type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} data-testid="staff-email" />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1 block">{t('Contrasena', 'Password')}</label>
                          <Input type="password" value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))} data-testid="staff-password" />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('Nombre completo', 'Full name')}</label>
                      <Input value={staffForm.full_name} onChange={e => setStaffForm(f => ({ ...f, full_name: e.target.value }))} data-testid="staff-name" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('Rol', 'Role')}</label>
                      <Select value={staffForm.role_label} onValueChange={v => setStaffForm(f => ({ ...f, role_label: v }))}>
                        <SelectTrigger data-testid="staff-role"><SelectValue placeholder={t('Seleccionar', 'Select')} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="moderador">{t('Moderador', 'Moderator')}</SelectItem>
                          <SelectItem value="operaciones">{t('Operaciones', 'Operations')}</SelectItem>
                          <SelectItem value="finanzas">{t('Finanzas', 'Finance')}</SelectItem>
                          <SelectItem value="soporte">{t('Soporte', 'Support')}</SelectItem>
                          <SelectItem value="personalizado">{t('Personalizado', 'Custom')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Permissions grid */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">{t('Permisos (tabs accesibles)', 'Permissions (accessible tabs)')}</label>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {['overview','businesses','users','reviews','categories','rankings','cities','config','support','reports','subscriptions','finance'].map(perm => (
                        <label key={perm} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                          staffForm.permissions.includes(perm) ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-muted/50 border border-transparent'
                        }`}>
                          <input type="checkbox" className="rounded" checked={staffForm.permissions.includes(perm)}
                            onChange={() => toggleStaffPerm(perm)} />
                          {perm === 'overview' ? t('Resumen', 'Overview') :
                           perm === 'businesses' ? t('Negocios', 'Businesses') :
                           perm === 'users' ? t('Usuarios', 'Users') :
                           perm === 'reviews' ? t('Resenas', 'Reviews') :
                           perm === 'categories' ? t('Categorias', 'Categories') :
                           perm === 'rankings' ? 'Rankings' :
                           perm === 'cities' ? t('Ciudades', 'Cities') :
                           perm === 'config' ? t('Config', 'Config') :
                           perm === 'support' ? t('Soporte', 'Support') :
                           perm === 'reports' ? t('Reportes', 'Reports') :
                           perm === 'subscriptions' ? t('Suscripciones', 'Subscriptions') :
                           t('Finanzas', 'Finance')}
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setStaffForm(f => ({ ...f, permissions: ['overview','businesses','users','reviews','categories','rankings','cities','config','support','reports','subscriptions','finance'] }))}>
                        {t('Seleccionar todos', 'Select all')}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setStaffForm(f => ({ ...f, permissions: [] }))}>
                        {t('Quitar todos', 'Deselect all')}
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSaveStaff} disabled={!staffForm.full_name || (!editingStaff && (!staffForm.email || !staffForm.password))} data-testid="save-staff-btn">
                      <CheckCircle2 className="h-4 w-4 mr-2" />{editingStaff ? t('Guardar', 'Save') : t('Crear', 'Create')}
                    </Button>
                    <Button variant="outline" onClick={resetStaffForm}><X className="h-4 w-4 mr-2" />{t('Cancelar', 'Cancel')}</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Staff list */}
            {staffLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
            ) : (
              <div className="space-y-3">
                {staffList.map(s => (
                  <Card key={s.id} data-testid={`staff-row-${s.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{s.full_name}</span>
                            <Badge variant="outline" className="text-xs capitalize">{s.role_label || 'staff'}</Badge>
                            {s.active === false && <Badge className="bg-red-100 text-red-700 text-xs">{t('Inactivo', 'Inactive')}</Badge>}
                            {s.totp_enabled && <Badge className="bg-green-100 text-green-700 text-xs">2FA</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{s.email}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(s.staff_permissions || []).map(p => (
                              <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                            ))}
                            {(!s.staff_permissions || s.staff_permissions.length === 0) && (
                              <span className="text-xs text-muted-foreground">{t('Sin permisos asignados', 'No permissions assigned')}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingStaff(s.id);
                            setStaffForm({ email: s.email, password: '', full_name: s.full_name, role_label: s.role_label || 'personalizado', permissions: s.staff_permissions || [] });
                            setShowStaffForm(true);
                          }} data-testid={`edit-staff-${s.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleResetStaffPassword(s.id)} data-testid={`reset-pw-${s.id}`}>
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteStaff(s.id, s.full_name)} data-testid={`delete-staff-${s.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {staffList.length === 0 && (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p>{t('No hay miembros de equipo. Crea uno para delegar acceso al panel.', 'No team members. Create one to delegate panel access.')}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
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
