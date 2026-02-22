import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { adminAPI } from '@/lib/api';
import { formatCurrency, getStatusColor, formatDate, getInitials } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Users, Building2, Calendar, DollarSign, CheckCircle2, XCircle, Clock,
  Shield, AlertTriangle, BarChart3, FileText, Star, Trash2, Ban
} from 'lucide-react';

export default function AdminDashboardPage() {
  const { t, language } = useI18n();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [pendingBusinesses, setPendingBusinesses] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/admin/login');
      return;
    }

    // Check 2FA
    if (!user?.totp_enabled) {
      navigate('/admin/setup-2fa');
      return;
    }

    loadData();
  }, [isAuthenticated, isAdmin, user]);

  const loadData = async () => {
    try {
      const [statsRes, pendingRes, logsRes] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getPendingBusinesses(),
        adminAPI.getAuditLogs({ page: 1, limit: 20 }),
      ]);
      setStats(statsRes.data);
      setPendingBusinesses(pendingRes.data);
      setAuditLogs(logsRes.data);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveBusiness = async (businessId) => {
    try {
      await adminAPI.approveBusiness(businessId);
      toast.success(language === 'es' ? 'Negocio aprobado' : 'Business approved');
      loadData();
    } catch (error) {
      toast.error(language === 'es' ? 'Error al aprobar' : 'Error approving');
    }
  };

  const handleRejectBusiness = async (businessId) => {
    const reason = window.prompt(language === 'es' ? 'Razón del rechazo:' : 'Rejection reason:');
    if (reason === null) return;

    try {
      await adminAPI.rejectBusiness(businessId, reason);
      toast.success(language === 'es' ? 'Negocio rechazado' : 'Business rejected');
      loadData();
    } catch (error) {
      toast.error(language === 'es' ? 'Error al rechazar' : 'Error rejecting');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="admin-dashboard-page">
      <div className="container-app py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold">Admin Panel</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-green-100 text-green-700">
                <Shield className="h-3 w-3 mr-1" />
                2FA {language === 'es' ? 'Activo' : 'Active'}
              </Badge>
              <span className="text-sm text-muted-foreground">{user?.email}</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Users className="h-8 w-8 text-blue-500" />
                <span className="text-3xl font-bold">{stats?.users?.total || 0}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {language === 'es' ? 'Usuarios' : 'Users'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Building2 className="h-8 w-8 text-purple-500" />
                <span className="text-3xl font-bold">{stats?.businesses?.total || 0}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {language === 'es' ? 'Negocios' : 'Businesses'}
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                {stats?.businesses?.pending || 0} {language === 'es' ? 'pendientes' : 'pending'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Calendar className="h-8 w-8 text-green-500" />
                <span className="text-3xl font-bold">{stats?.bookings?.this_month || 0}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {language === 'es' ? 'Reservas este mes' : 'Bookings this month'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <DollarSign className="h-8 w-8 text-emerald-500" />
                <span className="text-2xl font-bold">{formatCurrency(stats?.revenue?.this_month || 0)}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {language === 'es' ? 'Ingresos del mes' : 'Monthly revenue'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Pending Businesses */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                {language === 'es' ? 'Negocios Pendientes' : 'Pending Businesses'}
              </CardTitle>
              <Badge variant="outline">{pendingBusinesses.length}</Badge>
            </CardHeader>
            <CardContent>
              {pendingBusinesses.length > 0 ? (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {pendingBusinesses.map(biz => (
                    <div key={biz.id} className="p-4 rounded-xl bg-muted/50" data-testid={`pending-business-${biz.id}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{biz.name}</h4>
                          <p className="text-sm text-muted-foreground">{biz.email}</p>
                          <p className="text-sm text-muted-foreground">{biz.city}, {biz.state}</p>
                          <p className="text-xs text-muted-foreground mt-1">RFC: {biz.rfc}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:bg-green-50"
                            onClick={() => handleApproveBusiness(biz.id)}
                            data-testid={`approve-${biz.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            {language === 'es' ? 'Aprobar' : 'Approve'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleRejectBusiness(biz.id)}
                            data-testid={`reject-${biz.id}`}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            {language === 'es' ? 'Rechazar' : 'Reject'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  {language === 'es' ? 'No hay negocios pendientes' : 'No pending businesses'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Audit Logs */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                {language === 'es' ? 'Logs de Auditoría' : 'Audit Logs'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditLogs.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {auditLogs.map(log => (
                    <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className={`p-2 rounded-full ${
                        log.action.includes('approve') ? 'bg-green-100 text-green-600' :
                        log.action.includes('reject') || log.action.includes('suspend') ? 'bg-red-100 text-red-600' :
                        log.action.includes('delete') ? 'bg-yellow-100 text-yellow-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {log.action.includes('approve') && <CheckCircle2 className="h-4 w-4" />}
                        {log.action.includes('reject') && <XCircle className="h-4 w-4" />}
                        {log.action.includes('suspend') && <Ban className="h-4 w-4" />}
                        {log.action.includes('delete') && <Trash2 className="h-4 w-4" />}
                        {!['approve', 'reject', 'suspend', 'delete'].some(a => log.action.includes(a)) && <FileText className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize">{log.action.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          Target: {log.target_id?.substring(0, 8)}...
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(log.created_at, language === 'es' ? 'es-MX' : 'en-US')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  {language === 'es' ? 'No hay logs' : 'No logs'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats */}
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
            <CardContent className="p-4">
              <h4 className="font-medium text-blue-800 dark:text-blue-200">
                {language === 'es' ? 'Negocios Aprobados' : 'Approved Businesses'}
              </h4>
              <p className="text-3xl font-bold text-blue-600 mt-2">{stats?.businesses?.approved || 0}</p>
            </CardContent>
          </Card>

          <Card className="bg-green-50 dark:bg-green-900/20 border-green-200">
            <CardContent className="p-4">
              <h4 className="font-medium text-green-800 dark:text-green-200">
                {language === 'es' ? 'Reservas Completadas' : 'Completed Bookings'}
              </h4>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats?.bookings?.completed || 0}</p>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200">
            <CardContent className="p-4">
              <h4 className="font-medium text-purple-800 dark:text-purple-200">
                {language === 'es' ? 'Total Reservas' : 'Total Bookings'}
              </h4>
              <p className="text-3xl font-bold text-purple-600 mt-2">{stats?.bookings?.total || 0}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
