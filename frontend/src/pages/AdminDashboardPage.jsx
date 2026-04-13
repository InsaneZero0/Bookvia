import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { adminAPI } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Users, Building2, Calendar, DollarSign, CheckCircle2, XCircle, Clock,
  Shield, FileText, Search, Ban, ChevronLeft, ChevronRight, Download,
  Eye, Star, Wallet, BarChart3, AlertTriangle, Loader2
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

export default function AdminDashboardPage() {
  const { t, language } = useI18n();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [pendingBusinesses, setPendingBusinesses] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

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
    } catch {}
    setLoading(false);
  };

  const loadBusinesses = async (page = 1) => {
    setBizLoading(true);
    try {
      const res = await adminAPI.getAllBusinesses({ search: bizSearch, status: bizStatus, page, limit: 20 });
      setBusinesses(res.data.businesses);
      setBizTotal(res.data.total);
      setBizPages(res.data.pages);
      setBizPage(page);
    } catch {}
    setBizLoading(false);
  };

  const loadUsers = async (page = 1) => {
    setUsersLoading(true);
    try {
      const res = await adminAPI.getAllUsers({ search: usersSearch, page, limit: 20 });
      setUsers(res.data.users);
      setUsersTotal(res.data.total);
      setUsersPages(res.data.pages);
      setUsersPage(page);
    } catch {}
    setUsersLoading(false);
  };

  const loadFinance = async () => {
    setFinanceLoading(true);
    try {
      const res = await adminAPI.getSettlements({ page: 1, limit: 50 });
      setSettlements(res.data);
    } catch {}
    setFinanceLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'businesses') loadBusinesses(1);
    if (activeTab === 'users') loadUsers(1);
    if (activeTab === 'finance') loadFinance();
  }, [activeTab]);

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

  const handleExport = async (type) => {
    try {
      const res = type === 'transactions'
        ? await adminAPI.exportTransactions(exportYear, exportMonth)
        : await adminAPI.exportSettlements(exportYear, exportMonth);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${exportYear}_${exportMonth}.xlsx`;
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

        {/* ============ OVERVIEW TAB ============ */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Stats */}
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
              {/* Pending */}
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
                            <div className="min-w-0">
                              <h4 className="font-medium">{biz.name}</h4>
                              <p className="text-sm text-muted-foreground">{biz.email}</p>
                              <p className="text-sm text-muted-foreground">{biz.city}, {biz.state}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button size="sm" variant="outline" className="text-green-600 hover:bg-green-50"
                                onClick={() => handleApproveBusiness(biz.id)} data-testid={`approve-${biz.id}`}>
                                <CheckCircle2 className="h-4 w-4 mr-1" />{t('Aprobar', 'Approve')}
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50"
                                onClick={() => handleRejectBusiness(biz.id)} data-testid={`reject-${biz.id}`}>
                                <XCircle className="h-4 w-4 mr-1" />{t('Rechazar', 'Reject')}
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

              {/* Audit */}
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

            {/* Quick Stats */}
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
            {/* Search & Filters */}
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

            {/* Results count */}
            <p className="text-sm text-muted-foreground">{bizTotal} {t('negocios encontrados', 'businesses found')}</p>

            {/* Table */}
            {bizLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
            ) : (
              <div className="space-y-3">
                {businesses.map(biz => (
                  <Card key={biz.id} className="hover:shadow-md transition-shadow" data-testid={`biz-row-${biz.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold">{biz.name}</h4>
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

            {/* Pagination */}
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

        {/* ============ FINANCE TAB ============ */}
        {activeTab === 'finance' && (
          <div className="space-y-6">
            {/* Controls */}
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

            {/* Settlements list */}
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
