import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { businessesAPI } from '@/lib/api';
import { Loader2, Send, Mail, Users, Sparkles, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

const SEGMENT_LABELS = {
  all: 'Todos los inactivos (registrados sin reservar + clientes que se enfriaron)',
  never_booked: 'Solo registrados que nunca reservaron',
  stale_user: 'Solo clientes que reservaron antes y se enfriaron',
};

const TEMPLATE_LABELS = {
  miss_you: 'Te extranamos (para clientes que se enfriaron)',
  first_booking: 'Que te detiene (para registrados sin reservar)',
  new_businesses: 'Nuevos negocios (genérico, sin descuento)',
};

/**
 * Admin dashboard tab — Phase G winback campaigns. Lets the admin preview
 * the inactive user segment, choose template, and dispatch an email
 * campaign with optional $50 wallet incentive.
 */
export default function AdminWinbackTab() {
  const [segment, setSegment] = useState('all');
  const [template, setTemplate] = useState('miss_you');
  const [days, setDays] = useState(30);
  const [incentive, setIncentive] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastSummary, setLastSummary] = useState(null);

  const refreshUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await businessesAPI.adminInactiveUsers({ segment, days, limit: 500 });
      setUsers(res.data?.users || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al cargar usuarios');
    } finally {
      setLoadingUsers(false);
    }
  };

  const refreshHistory = async () => {
    try {
      const res = await businessesAPI.adminWinbackHistory();
      setHistory(res.data?.campaigns || []);
    } catch { /* silent */ }
  };

  useEffect(() => { refreshUsers(); /* eslint-disable-next-line */ }, [segment, days]);
  useEffect(() => { refreshHistory(); }, []);

  const handleRun = async () => {
    setConfirmOpen(false);
    setRunning(true);
    try {
      const res = await businessesAPI.adminRunWinbackCampaign({
        segment, template, days, incentive, dry_run: dryRun,
      });
      setLastSummary(res.data);
      toast.success(`Campana ${dryRun ? '(SIMULACION)' : 'enviada'}: ${res.data.sent} enviados, ${res.data.failed} fallidos`);
      await refreshHistory();
      await refreshUsers();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al enviar campana');
    } finally {
      setRunning(false);
    }
  };

  const targetCount = users.length;
  const totalSpent = users.reduce((s, u) => s + (u.total_spent_mxn || 0), 0);

  return (
    <div className="space-y-6" data-testid="admin-winback-tab">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-500" />
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Usuarios inactivos</p>
              <p className="text-2xl font-bold" data-testid="winback-kpi-count">{targetCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <Mail className="w-8 h-8 text-emerald-500" />
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Gasto historico</p>
              <p className="text-2xl font-bold">${totalSpent.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Campanas previas</p>
              <p className="text-2xl font-bold">{history.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configurator */}
      <Card>
        <CardHeader>
          <CardTitle>Nueva campana de reactivacion</CardTitle>
          <CardDescription>
            Envia un correo a todos los usuarios inactivos. Anti-spam: maximo 1 correo cada 15 dias por usuario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Segmento</Label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger data-testid="winback-segment-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template</Label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger data-testid="winback-template-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TEMPLATE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dias minimos de inactividad</Label>
              <Input
                type="number"
                min="7"
                max="365"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                data-testid="winback-days-input"
              />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="incentive-switch" className="text-sm">
                  Incluir $50 saldo Bookvia <span className="text-xs text-slate-400">(activar cuando tengas suscriptores)</span>
                </Label>
                <Switch id="incentive-switch" checked={incentive} onCheckedChange={setIncentive} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="dry-run-switch" className="text-sm">Modo simulacion (no envia)</Label>
                <Switch id="dry-run-switch" checked={dryRun} onCheckedChange={setDryRun} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={refreshUsers}
              disabled={loadingUsers}
              data-testid="winback-refresh-btn"
            >
              <RefreshCcw className={`w-4 h-4 mr-2 ${loadingUsers ? 'animate-spin' : ''}`} />
              Recargar lista
            </Button>
            <Button
              className="bg-[#F05D5E] hover:bg-[#D94A4B] text-white"
              onClick={() => setConfirmOpen(true)}
              disabled={running || targetCount === 0}
              data-testid="winback-send-btn"
            >
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {dryRun ? `Simular envio a ${targetCount}` : `Enviar a ${targetCount} usuarios`}
            </Button>
          </div>

          {lastSummary && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm" data-testid="winback-last-summary">
              <p className="font-medium text-emerald-900">
                Ultima campana: {lastSummary.sent} enviados / {lastSummary.failed} fallidos {lastSummary.dry_run ? '(simulacion)' : ''}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User table preview */}
      <Card>
        <CardHeader>
          <CardTitle>Vista previa ({users.length})</CardTitle>
          <CardDescription>Excluye usuarios dados de baja y los contactados en los ultimos 15 dias.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Cargando...</div>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No hay usuarios elegibles ahora mismo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b">
                  <tr>
                    <th className="py-2">Nombre</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Segmento</th>
                    <th className="py-2 text-right">Reservas</th>
                    <th className="py-2 text-right">Gasto</th>
                    <th className="py-2 text-right">Inactivo</th>
                  </tr>
                </thead>
                <tbody>
                  {users.slice(0, 50).map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 truncate max-w-[140px]">{u.name || '-'}</td>
                      <td className="py-2 truncate max-w-[180px]">{u.email}</td>
                      <td className="py-2">
                        <Badge variant="outline">{u.segment === 'never_booked' ? 'No-reservado' : 'Frio'}</Badge>
                      </td>
                      <td className="py-2 text-right">{u.completed_bookings}</td>
                      <td className="py-2 text-right">${(u.total_spent_mxn || 0).toFixed(0)}</td>
                      <td className="py-2 text-right text-slate-500">
                        {u.days_since_last_booking ?? u.days_since_signup ?? '-'} dias
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length > 50 && (
                <p className="text-xs text-slate-400 mt-2">Mostrando 50 de {users.length}.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historial de campanas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b">
                  <tr>
                    <th className="py-2">Fecha</th>
                    <th className="py-2">Segmento</th>
                    <th className="py-2">Template</th>
                    <th className="py-2 text-right">Enviados</th>
                    <th className="py-2 text-right">Fallidos</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2">{(c.started_at || '').slice(0, 10)}</td>
                      <td className="py-2">{c.segment}</td>
                      <td className="py-2">{c.template}</td>
                      <td className="py-2 text-right text-emerald-600 font-medium">{c.sent}</td>
                      <td className="py-2 text-right text-red-500">{c.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar campana</AlertDialogTitle>
            <AlertDialogDescription>
              Estas a punto de enviar <strong>{targetCount} correos</strong>{' '}
              {dryRun && <em>(modo simulacion, no se envian)</em>}.
              {incentive && !dryRun && (
                <span> Cada usuario recibira un codigo de <strong>$50 MXN</strong> de saldo Bookvia (vence en 7 dias).</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRun}
              className="bg-[#F05D5E] hover:bg-[#D94A4B]"
              data-testid="winback-confirm-action"
            >
              {dryRun ? 'Simular' : 'Enviar campana'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
