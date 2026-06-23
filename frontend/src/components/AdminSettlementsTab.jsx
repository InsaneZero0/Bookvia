import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Banknote, Zap, FileDown, Play, AlertTriangle, CheckCircle2,
  Clock, XCircle, Lock, RefreshCcw, Calendar, Eye, UserX, CalendarX,
  FileSpreadsheet,
} from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Default period: current month's day-20 (or last month's if before day 20). */
function defaultPeriodKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-20`;
}

const STATUS_BADGE = {
  pending: { label: 'Pendiente', cn: 'bg-amber-100 text-amber-800', icon: Clock },
  paid:    { label: 'Pagado',    cn: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  failed:  { label: 'Falló',     cn: 'bg-red-100 text-red-800', icon: XCircle },
  held:    { label: 'Retenido',  cn: 'bg-slate-200 text-slate-800', icon: Lock },
};

export default function AdminSettlementsTab() {
  const [period, setPeriod] = useState(defaultPeriodKey());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [breakdown, setBreakdown] = useState({ open: false, loading: false, data: null });

  const [stuckDiag, setStuckDiag] = useState({ open: false, loading: false, items: [] });
  const [txInspect, setTxInspect] = useState({ open: false, loading: false, data: null });
  const [overview, setOverview] = useState({ open: false, loading: false, data: null, businessName: '' });

  const openPeriodOverview = async (businessId, businessName) => {
    setOverview({ open: true, loading: true, data: null, businessName });
    try {
      const res = await api.get(`/admin/businesses/${businessId}/period-overview?period_key=${period}`);
      setOverview({ open: true, loading: false, data: res.data, businessName });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo cargar el panorama');
      setOverview({ open: false, loading: false, data: null, businessName: '' });
    }
  };

  const loadStuckCancellations = async () => {
    setStuckDiag({ open: true, loading: true, items: [] });
    try {
      const res = await api.get('/admin/finance/stuck-late-cancellations');
      setStuckDiag({ open: true, loading: false, items: res.data?.items || [] });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error');
      setStuckDiag({ open: false, loading: false, items: [] });
    }
  };

  const inspectTransaction = async (txId) => {
    setTxInspect({ open: true, loading: true, data: null });
    try {
      const res = await api.get(`/admin/finance/transactions/${txId}/full-detail`);
      setTxInspect({ open: true, loading: false, data: res.data });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error');
      setTxInspect({ open: false, loading: false, data: null });
    }
  };

  const forceClearSingleTx = async (txId) => {
    try {
      const res = await api.post(`/admin/finance/transactions/${txId}/force-clear-single`);
      toast.success(`Transaccion liberada (estaba en ${res.data.previous_state})`);
      await loadStuckCancellations();
      await load();
      setTxInspect({ open: false, loading: false, data: null });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo forzar');
    }
  };

  const deleteAbandonedTx = async (txId) => {
    try {
      const res = await api.delete(
        `/admin/finance/transactions/${txId}/delete-abandoned?confirm=DELETE-${txId}`
      );
      toast.success(`Eliminada (tx=${res.data.deleted_transaction}, booking=${res.data.deleted_booking})`);
      await loadStuckCancellations();
      await load();
      setTxInspect({ open: false, loading: false, data: null });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo eliminar');
    }
  };

  const openBreakdown = async (settlementId) => {
    setBreakdown({ open: true, loading: true, data: null });
    try {
      const res = await api.get(`/admin/settlements/${settlementId}/breakdown`);
      setBreakdown({ open: true, loading: false, data: res.data });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo cargar el desglose');
      setBreakdown({ open: false, loading: false, data: null });
    }
  };

  const exportBreakdownExcel = async (settlementId, businessName) => {
    const tId = toast.loading('Generando archivo Excel...');
    try {
      const res = await api.get(
        `/admin/settlements/${settlementId}/breakdown.xlsx`,
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookvia-liquidacion-${(businessName || 'negocio').replace(/\s+/g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Excel descargado', { id: tId });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo generar el Excel', { id: tId });
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/settlements/period/${period}/detail`);
      setData(res.data);
    } catch (e) {
      toast.error('No se pudo cargar el periodo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/admin/settlements/period/${period}/detail`);
        if (!cancelled) setData(res.data);
      } catch (e) {
        if (!cancelled) toast.error('No se pudo cargar el periodo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const generateDay20 = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/admin/settlements/generate-day20?force=true`);
      toast.success(`Generadas ${res.data?.settlements_created || 0} liquidaciones`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al generar liquidaciones');
    } finally {
      setBusy(false);
    }
  };

  const previewBatch = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/admin/settlements/period/${period}/execute-stripe-batch?dry_run=true`);
      setPreviewResult(res.data);
    } catch (e) {
      toast.error('Error al simular el lote');
    } finally {
      setBusy(false);
    }
  };

  const executeBatch = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/admin/settlements/period/${period}/execute-stripe-batch`);
      const c = res.data?.counts || {};
      toast.success(
        `Procesado: ${c.succeeded} OK · ${c.no_connect} sin Connect · ${c.failed} fallaron`,
        { duration: 6000 }
      );
      setPreviewResult(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al procesar el lote');
    } finally {
      setBusy(false);
    }
  };

  const executeOne = async (settlementId, name) => {
    setBusy(true);
    try {
      const res = await api.post(`/admin/settlements/${settlementId}/execute-stripe-transfer`);
      if (res.data?.ok) {
        toast.success(`${name}: $${res.data.amount?.toFixed(2)} liberado via Stripe`);
      } else if (res.data?.reason === 'no_connect') {
        toast.warning(`${name} no tiene Stripe Connect — usa exportar SPEI`);
      } else {
        toast.error(`${name}: ${res.data?.reason || 'error'}`);
      }
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const exportSpei = async (bank = 'generic') => {
    setBusy(true);
    try {
      const res = await api.get(
        `/admin/settlements/${period}/export-spei.csv?bank=${bank}`,
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookvia-spei-${period}-${bank}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`CSV ${bank.toUpperCase()} descargado`);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) {
        toast.error('Sesion expirada, vuelve a iniciar sesion');
      } else if (status === 404) {
        toast.error('No hay liquidaciones para este periodo todavia');
      } else {
        toast.error(e?.response?.data?.detail || 'No se pudo generar el CSV');
      }
    } finally {
      setBusy(false);
    }
  };

  const totals = data?.totals || {};
  const items = data?.items || [];

  return (
    <div className="space-y-6" data-testid="admin-settlements-tab">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Banknote className="h-6 w-6 text-[#F05D5E]" />
            Liquidación a Negocios
          </h2>
          <p className="text-sm text-muted-foreground">
            Periodo del día 20 — corte mensual de liquidación
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="YYYY-MM-20"
            className="w-36"
            data-testid="settlement-period-input"
          />
          <Button variant="outline" size="sm" onClick={load} data-testid="settlement-refresh">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Aviso de huerfanos detectados */}
      {(totals.orphan_count || 0) > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-3"
             data-testid="orphan-settlements-notice">
          <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-amber-900 text-sm">
              {totals.orphan_count} liquidacion(es) de negocios ya eliminados ({fmt(totals.orphan_amount)})
            </div>
            <div className="text-xs text-amber-800 mt-0.5">
              Se ocultan automaticamente del listado. Para borrarlas definitivamente, abre
              &quot;Herramientas avanzadas&quot; abajo y usa <strong>Limpiar negocios borrados</strong>.
            </div>
          </div>
        </div>
      )}

      {/* KPIs del periodo */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total del periodo</div>
            <div className="text-2xl font-bold mt-1">{fmt(totals.total_net)}</div>
            <div className="text-xs text-muted-foreground mt-1">{totals.settlements_total || 0} liquidaciones</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Por pagar</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{fmt(totals.amount_pending)}</div>
            <div className="text-xs text-muted-foreground mt-1">{totals.stripe_ready || 0} listas para Stripe</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Pagado</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{fmt(totals.amount_paid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Requieren SPEI manual</div>
            <div className="text-2xl font-bold text-slate-600 mt-1">{totals.needs_spei || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Sin Stripe Connect</div>
          </CardContent>
        </Card>
      </div>

      {/* Acciones globales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Acciones del periodo</CardTitle>
          <CardDescription>
            Primero genera el corte, después ejecuta las transferencias Stripe en lote o caso por caso
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={generateDay20} disabled={busy} data-testid="generate-day20-btn">
              <Calendar className="h-4 w-4 mr-2" />
              Generar liquidaciones del periodo
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button onClick={previewBatch} disabled={busy || !items.length}
                        className="bg-[#F05D5E] hover:bg-[#d94e4f] text-white"
                        data-testid="execute-batch-btn">
                  <Zap className="h-4 w-4 mr-2" />
                  Ejecutar transferencias Stripe (lote)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar ejecución del lote</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2">
                      {previewResult ? (
                        <>
                          <p>Se procesarán <strong>{previewResult.total}</strong> liquidaciones pendientes en <strong>{period}</strong>:</p>
                          <ul className="text-sm space-y-1 ml-4 list-disc">
                            <li>Listas para Stripe (Connect activo): {previewResult.counts?.succeeded}</li>
                            <li>Sin Connect (requerirán SPEI): {previewResult.counts?.no_connect}</li>
                            <li>Ya pagadas (se saltarán): {previewResult.counts?.skipped}</li>
                          </ul>
                          <p className="text-xs text-amber-700 mt-3">
                            ⚠️ Esto moverá dinero REAL de Bookvia Stripe → cuentas Stripe de cada negocio. No se puede deshacer.
                          </p>
                        </>
                      ) : <p>Calculando preview...</p>}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setPreviewResult(null)}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={executeBatch} className="bg-[#F05D5E] hover:bg-[#d94e4f]">
                    Ejecutar transferencias
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button variant="outline" onClick={() => exportSpei('bbva')} disabled={!items.length} data-testid="export-spei-bbva">
              <FileDown className="h-4 w-4 mr-2" /> CSV SPEI (BBVA)
            </Button>
            <Button variant="outline" onClick={() => exportSpei('banorte')} disabled={!items.length}>
              <FileDown className="h-4 w-4 mr-2" /> CSV SPEI (Banorte)
            </Button>
            <Button variant="outline" onClick={() => exportSpei('generic')} disabled={!items.length}>
              <FileDown className="h-4 w-4 mr-2" /> CSV genérico
            </Button>
          </div>

          {/* Advanced tools (collapsed by default) */}
          <details className="border rounded-md group" data-testid="advanced-tools-details">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30 transition-colors flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-medium">Herramientas avanzadas</span>
              <span className="text-xs">(diagnóstico y reparación)</span>
            </summary>
            <div className="p-3 border-t bg-muted/10 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} data-testid="diagnose-funds-btn"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await api.get('/admin/finance/funds-state-summary');
                    const s = res.data.summary || {};
                    const pending = res.data.pending_completion_count || 0;
                    const lines = [];
                    Object.entries(s).forEach(([state, info]) => lines.push(`${state}: ${info.count} tx ($${info.total_payout_mxn})`));
                    if (pending > 0) lines.push(`${pending} citas pendientes de completar`);
                    toast(lines.join(' · ') || 'Sin transacciones', { duration: 12000 });
                  } catch (e) {
                    toast.error(e?.response?.data?.detail || 'Error');
                  } finally { setBusy(false); }
                }}>
                Diagnóstico
              </Button>

              <Button variant="outline" size="sm" disabled={busy} data-testid="debug-cleared-btn"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await api.get('/admin/finance/cleared-transactions-debug');
                    const txs = res.data.items || [];
                    if (txs.length === 0) { toast('No hay transacciones CLEARED'); return; }
                    const groups = {};
                    txs.forEach(tx => {
                      const k = tx.would_skip ? (tx.skip_reasons[0] || 'unknown') : 'OK';
                      if (!groups[k]) groups[k] = { count: 0, amount: 0 };
                      groups[k].count += 1;
                      groups[k].amount += tx.business_amount || tx.payout_amount || 0;
                    });
                    const lines = Object.entries(groups).map(([reason, info]) => `${reason}: ${info.count} tx ($${info.amount.toFixed(2)})`);
                    toast(lines.join(' | '), { duration: 20000 });
                    console.log('Cleared transactions debug:', txs);
                  } catch (e) {
                    toast.error(e?.response?.data?.detail || 'Error');
                  } finally { setBusy(false); }
                }}>
                ¿Por qué no liquidan?
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy} data-testid="repair-uninit-btn">
                    Inicializar fondos
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Inicializar transacciones sin funds_state</AlertDialogTitle>
                    <AlertDialogDescription>
                      Pone en PENDING_HOLD las transacciones pagadas sin funds_state. Luego corre Auto-completar y Forzar liberación.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                      setBusy(true);
                      try {
                        const res = await api.post('/admin/finance/repair-uninitialized-transactions');
                        toast.success(`${res.data.initialized} de ${res.data.scanned} inicializadas`);
                        await load();
                      } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); } finally { setBusy(false); }
                    }}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy} data-testid="release-orphan-btn">
                    Liberar huérfanas
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Liberar settlement_id huérfano</AlertDialogTitle>
                    <AlertDialogDescription>
                      Encuentra transacciones cuyo settlement_id apunta a un registro inexistente y lo limpia.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                      setBusy(true);
                      try {
                        const res = await api.post('/admin/finance/release-orphan-settled-transactions');
                        toast.success(`${res.data.released} tx liberadas · $${res.data.total_amount_now_settleable}`);
                        await load();
                      } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); } finally { setBusy(false); }
                    }}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy} data-testid="auto-complete-btn">
                    Auto-completar citas pasadas
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Auto-completar citas vencidas</AlertDialogTitle>
                    <AlertDialogDescription>
                      Marca como completed las citas confirmadas con +24h de antigüedad y mueve fondos a AVAILABLE.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                      setBusy(true);
                      try {
                        const res = await api.post('/admin/finance/auto-complete-past-bookings?hours=24');
                        toast.success(`${res.data.completed} de ${res.data.scanned} completadas`);
                        await load();
                      } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); } finally { setBusy(false); }
                    }}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy} data-testid="force-clear-btn">
                    Forzar liberación (skip 24h)
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Forzar AVAILABLE → CLEARED</AlertDialogTitle>
                    <AlertDialogDescription>
                      Salta la ventana de 24h para incluir esos fondos en el corte de HOY.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                      setBusy(true);
                      try {
                        const res = await api.post('/admin/finance/force-clear-available?skip_grace=true');
                        toast.success(`${res.data.cleared} de ${res.data.scanned} liberadas`);
                        await load();
                      } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); } finally { setBusy(false); }
                    }}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy}
                          className="text-red-700 border-red-300 hover:bg-red-50"
                          data-testid="cleanup-orphans-btn">
                    Limpiar negocios borrados
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar liquidaciones de negocios borrados</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div>
                        Borra definitivamente las liquidaciones cuyo negocio ya no existe en la
                        plataforma (negocios de prueba o duplicados eliminados). Sus transacciones
                        quedan liberadas para futuros cortes.
                        <p className="text-xs text-amber-700 mt-2">
                          Solo afecta liquidaciones <strong>pendientes</strong>. Las ya pagadas
                          se conservan para historial.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          // 1) Preview
                          const pre = await api.post('/admin/settlements/cleanup-orphans?dry_run=true');
                          const wouldDelete = pre.data?.would_delete || 0;
                          if (wouldDelete === 0) {
                            toast('No hay liquidaciones huerfanas que limpiar');
                            return;
                          }
                          // 2) Real cleanup
                          const res = await api.post('/admin/settlements/cleanup-orphans');
                          toast.success(
                            `${res.data.deleted} liquidaciones eliminadas · $${res.data.amount_freed} liberados`,
                            { duration: 6000 }
                          );
                          await load();
                        } catch (e) {
                          toast.error(e?.response?.data?.detail || 'Error');
                        } finally {
                          setBusy(false);
                        }
                      }}>
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button variant="outline" size="sm" disabled={busy}
                data-testid="diagnose-stuck-cancellations-btn"
                onClick={loadStuckCancellations}>
                Diagnostico cancelaciones tardias
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy}
                          className="text-red-700 border-red-300 hover:bg-red-50"
                          data-testid="bulk-delete-test-biz-btn">
                    Borrar negocios de prueba (DB)
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>⚠️ Borrar negocios SIN Stripe Connect</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div>
                        Elimina <strong>permanentemente</strong> de la base de datos todos los
                        negocios que NO tienen Stripe Connect configurado (tipicamente negocios
                        de prueba o demos). Borra tambien sus servicios, citas, transacciones
                        y liquidaciones pendientes.
                        <p className="text-xs text-amber-700 mt-2">
                          Se conservan los que tienen liquidaciones <strong>ya pagadas</strong>
                          (proteccion contra borrar historial financiero). Esta accion es
                          irreversible.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const res = await api.post(
                            '/admin/businesses/bulk-hard-delete-test?confirm=DELETE-TEST-BUSINESSES'
                          );
                          toast.success(
                            `${res.data.deleted} negocios borrados, ${res.data.skipped} preservados`,
                            { duration: 8000 }
                          );
                          console.log('Resultados del borrado:', res.data.results);
                          await load();
                        } catch (e) {
                          toast.error(e?.response?.data?.detail || 'Error');
                        } finally {
                          setBusy(false);
                        }
                      }}>
                      Borrar definitivamente
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Tabla detallada por negocio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalle por negocio</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground" data-testid="empty-settlements">
              No hay liquidaciones para este periodo todavía.<br/>
              <span className="text-xs">Click &quot;Generar liquidaciones&quot; para crear el corte del día 20.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Negocio</th>
                    <th className="py-2 text-right">Citas</th>
                    <th className="py-2 text-right">Monto neto</th>
                    <th className="py-2">Estado</th>
                    <th className="py-2">Método</th>
                    <th className="py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const sb = STATUS_BADGE[row.status] || STATUS_BADGE.pending;
                    const SBIcon = sb.icon;
                    return (
                      <tr key={row.settlement_id}
                          className="border-b hover:bg-muted/30 cursor-pointer"
                          onClick={() => openBreakdown(row.settlement_id)}
                          data-testid={`settlement-row-${row.settlement_id}`}>
                        <td className="py-3">
                          <div className="font-medium flex items-center gap-2">
                            {row.business_name}
                            <Eye className="h-3 w-3 text-muted-foreground" />
                          </div>
                          {row.clabe ? <div className="text-xs text-muted-foreground">CLABE ****{String(row.clabe).slice(-4)}</div> : null}
                        </td>
                        <td className="py-3 text-right">{row.booking_count}</td>
                        <td className="py-3 text-right font-semibold">{fmt(row.amount)}</td>
                        <td className="py-3">
                          <Badge className={`${sb.cn} hover:${sb.cn} gap-1`}>
                            <SBIcon className="h-3 w-3" />{sb.label}
                          </Badge>
                        </td>
                        <td className="py-3 text-xs">
                          {row.payout_hold ? (
                            <Badge variant="outline" className="text-red-700"><Lock className="h-3 w-3 mr-1" />Hold</Badge>
                          ) : row.preferred_method === 'stripe_transfer' ? (
                            <Badge variant="outline" className="text-emerald-700"><Zap className="h-3 w-3 mr-1" />Stripe</Badge>
                          ) : row.preferred_method === 'manual_spei' ? (
                            <Badge variant="outline" className="text-slate-600">SPEI manual</Badge>
                          ) : (
                            <Badge variant="outline">{row.preferred_method}</Badge>
                          )}
                        </td>
                        <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" disabled={busy}
                                    onClick={() => openPeriodOverview(row.business_id, row.business_name)}
                                    data-testid={`overview-${row.settlement_id}`}
                                    title="Ver TODAS las citas del periodo (transparencia total)">
                              <Eye className="h-3 w-3 mr-1" /> TODO
                            </Button>
                            {row.status === 'pending' && row.connect_ready && !row.payout_hold ? (
                            <Button size="sm" variant="ghost" disabled={busy}
                                    onClick={() => executeOne(row.settlement_id, row.business_name)}
                                    data-testid={`execute-one-${row.settlement_id}`}>
                              <Play className="h-3 w-3 mr-1" /> Liberar
                            </Button>
                          ) : row.status === 'paid' && row.stripe_transfer_id ? (
                            <a
                              href={`https://dashboard.stripe.com/connect/transfers/${row.stripe_transfer_id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#F05D5E] hover:underline">
                              Ver en Stripe
                            </a>
                          ) : row.last_error ? (
                            <span className="text-xs text-red-600" title={row.last_error}>
                              <AlertTriangle className="h-3 w-3 inline mr-1" />Error
                            </span>
                          ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Diagnostico cancelaciones tardias */}
      <Dialog
        open={stuckDiag.open}
        onOpenChange={(open) => !open && setStuckDiag({ open: false, loading: false, items: [] })}
      >
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          data-testid="stuck-cancellations-modal"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Diagnostico de cancelaciones tardias
            </DialogTitle>
            <DialogDescription>
              Cada cancelacion del cliente cuya plata pertenece al negocio y su estado actual.
            </DialogDescription>
          </DialogHeader>
          {stuckDiag.loading && <Skeleton className="h-40 w-full" />}
          {!stuckDiag.loading && stuckDiag.items.length === 0 && (
            <div className="text-center py-8 text-emerald-700 text-sm" data-testid="stuck-empty">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
              Ninguna cancelacion tardia atascada — todo limpio
            </div>
          )}
          {!stuckDiag.loading && stuckDiag.items.length > 0 && (
            <StuckCancellationsView
              items={stuckDiag.items}
              onInspect={inspectTransaction}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Inspeccionar transaccion con info de Stripe */}
      <Dialog
        open={txInspect.open}
        onOpenChange={(open) => !open && setTxInspect({ open: false, loading: false, data: null })}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          data-testid="tx-inspect-modal"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-amber-600" />
              Investigar transaccion atascada
            </DialogTitle>
            <DialogDescription>
              Revisa el estado real en Stripe antes de actuar.
            </DialogDescription>
          </DialogHeader>
          {txInspect.loading && <Skeleton className="h-48 w-full" />}
          {txInspect.data && (
            <TxInspectView
              data={txInspect.data}
              onForceClear={forceClearSingleTx}
              onDeleteAbandoned={deleteAbandonedTx}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Desglose del settlement */}
      <Dialog
        open={breakdown.open}
        onOpenChange={(open) => !open && setBreakdown({ open: false, loading: false, data: null })}
      >
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          data-testid="settlement-breakdown-modal"
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-[#F05D5E]" />
                  Desglose de la liquidacion
                </DialogTitle>
                <DialogDescription>
                  {breakdown.data?.business_name} · Periodo {breakdown.data?.period_key}
                </DialogDescription>
              </div>
              {breakdown.data && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportBreakdownExcel(breakdown.data.settlement_id, breakdown.data.business_name)}
                  data-testid="export-breakdown-excel-btn"
                  className="shrink-0"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-700" />
                  Excel
                </Button>
              )}
            </div>
          </DialogHeader>
          {breakdown.loading && <Skeleton className="h-40 w-full" />}
          {breakdown.data && <BreakdownView data={breakdown.data} />}
        </DialogContent>
      </Dialog>

      {/* Modal: Panorama Completo del Periodo (TRANSPARENCIA TOTAL) */}
      <Dialog
        open={overview.open}
        onOpenChange={(open) => !open && setOverview({ open: false, loading: false, data: null, businessName: '' })}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="period-overview-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-[#F05D5E]" />
              Panorama COMPLETO del período — {overview.businessName}
            </DialogTitle>
            <DialogDescription>
              TODAS las citas que tocaron a este negocio en el período, con explicación de qué pasó con cada peso.
            </DialogDescription>
          </DialogHeader>
          {overview.loading && <Skeleton className="h-60 w-full" />}
          {overview.data && <PeriodOverviewView data={overview.data} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const BUCKET_ICONS = {
  completed: CheckCircle2,
  late_cancel_penalty: CalendarX,
  no_show_penalty: UserX,
  other: AlertTriangle,
};
const BUCKET_COLORS = {
  completed: 'text-emerald-600 bg-emerald-50',
  late_cancel_penalty: 'text-amber-700 bg-amber-50',
  no_show_penalty: 'text-rose-700 bg-rose-50',
  other: 'text-slate-600 bg-slate-50',
};

function BreakdownView({ data }) {
  const t = data.totals || {};
  const hasHybrid = (t.hybrid_count || 0) > 0;
  return (
    <div className="space-y-5" data-testid="breakdown-view">
      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Total a pagar al negocio</div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{fmt(data.net_payout)}</div>
          <div className="text-xs text-muted-foreground mt-1">{data.booking_count} cita(s)</div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Cobrado al cliente</div>
          <div className="text-lg font-semibold mt-1">{fmt(t.client_paid)}</div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Comisiones Bookvia</div>
          <div className="text-lg font-semibold text-[#F05D5E] mt-1">{fmt(t.bookvia_fee)}</div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Fees de Stripe</div>
          <div className="text-lg font-semibold text-slate-700 mt-1">{fmt(t.stripe_fee)}</div>
        </div>
      </div>

      {/* Aviso de pagos hibridos */}
      {hasHybrid && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm" data-testid="hybrid-payment-notice">
          <div className="flex items-start gap-2">
            <Banknote className="h-4 w-4 text-violet-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-violet-900">
                {t.hybrid_count} cita(s) pagada(s) con saldo Bookvia + tarjeta
              </div>
              <div className="text-xs text-violet-800 mt-1">
                Saldo aplicado: {fmt(t.wallet_applied)} · Cobrado a tarjeta: {fmt(t.stripe_charged)}.
                El negocio recibe el monto completo de cada cita; los fondos del saldo Bookvia
                vienen del saldo agregado en Stripe.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buckets */}
      {(data.breakdown || []).map((bucket) => {
        const Icon = BUCKET_ICONS[bucket.key] || AlertTriangle;
        const colorCn = BUCKET_COLORS[bucket.key] || BUCKET_COLORS.other;
        return (
          <div key={bucket.key} className="rounded-lg border" data-testid={`bucket-${bucket.key}`}>
            <div className={`flex items-center justify-between px-4 py-3 ${colorCn} rounded-t-lg`}>
              <div className="flex items-center gap-2 font-semibold">
                <Icon className="h-4 w-4" />
                <span>{bucket.label_es}</span>
                <Badge variant="outline" className="ml-2">{bucket.count}</Badge>
              </div>
              <div className="font-bold text-lg">{fmt(bucket.amount)}</div>
            </div>
            <div className="divide-y">
              {bucket.items.map((it) => (
                <div key={it.transaction_id} className="px-4 py-2 text-sm flex items-center justify-between gap-3"
                     data-testid={`bucket-item-${it.transaction_id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      {it.client_name}
                      {it.is_hybrid_payment && (
                        <Badge variant="outline" className="text-violet-700 border-violet-300 bg-violet-50 text-[10px] gap-1">
                          <Banknote className="h-2.5 w-2.5" /> Saldo + Tarjeta
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {it.date} {it.time} · {it.service_name}
                    </div>
                    {it.cancellation_reason && (
                      <div className="text-xs text-amber-700 mt-0.5">
                        Motivo: {it.cancellation_reason}
                      </div>
                    )}
                    {it.is_hybrid_payment && (
                      <div className="text-[10px] text-violet-700 mt-0.5">
                        Saldo Bookvia aplicado: {fmt(it.wallet_applied)} · Tarjeta: {fmt(it.stripe_charged)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">{fmt(it.business_net)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Cliente pago {fmt(it.client_paid)} · Bookvia {fmt(it.bookvia_fee)} · Stripe {fmt(it.stripe_fee)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {(!data.breakdown || data.breakdown.length === 0) && (
        <div className="text-center py-6 text-muted-foreground text-sm">
          Esta liquidacion no tiene transacciones asociadas.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PERIOD OVERVIEW — Vista de TRANSPARENCIA TOTAL del periodo para un negocio.
// Muestra TODAS las citas (no solo las del settlement) clasificadas por
// situacion (pago al negocio / refund cliente / cancelacion del negocio), con
// reconciliacion financiera completa para auditoria.
// ============================================================================

const OVERVIEW_BUCKET_STYLES = {
  paid_to_business_completed:   { color: 'border-emerald-300 bg-emerald-50',  text: 'text-emerald-900', icon: CheckCircle2, accent: 'text-emerald-700' },
  paid_to_business_late_cancel: { color: 'border-amber-300 bg-amber-50',      text: 'text-amber-900',   icon: Clock,        accent: 'text-amber-700'   },
  paid_to_business_no_show:     { color: 'border-rose-300 bg-rose-50',        text: 'text-rose-900',    icon: UserX,        accent: 'text-rose-700'    },
  client_cancel_within_grace:   { color: 'border-blue-300 bg-blue-50',        text: 'text-blue-900',    icon: RefreshCcw,   accent: 'text-blue-700'    },
  business_cancelled_refund:    { color: 'border-violet-300 bg-violet-50',    text: 'text-violet-900',  icon: XCircle,      accent: 'text-violet-700'  },
  pending_or_other:             { color: 'border-slate-300 bg-slate-50',      text: 'text-slate-900',   icon: AlertTriangle,accent: 'text-slate-700'   },
};

function PeriodOverviewView({ data }) {
  const t = data.totals || {};
  const cur = data.business_current || {};

  return (
    <div className="space-y-4">
      {/* Cabecera con resumen */}
      <Card className="border-2 border-[#F05D5E]/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase text-muted-foreground">
            Resumen del período {data.period_key}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Cliente pagó (total)</div>
              <div className="font-semibold text-base">{fmt(t.client_paid_total)}</div>
              <div className="text-[10px] text-muted-foreground">Stripe: {fmt(t.card_charged_total)} · Wallet: {fmt(t.wallet_applied_total)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">A pagar al NEGOCIO (bruto)</div>
              <div className="font-semibold text-base text-emerald-700">{fmt(t.to_business_total)}</div>
              <div className="text-[10px] text-muted-foreground">Penalty acumulada: {fmt(cur.penalty_balance)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Devuelto al CLIENTE</div>
              <div className="font-semibold text-base text-blue-700">{fmt(Number(t.refunded_to_card_total||0) + Number(t.refunded_to_wallet_total||0))}</div>
              <div className="text-[10px] text-muted-foreground">Tarjeta: {fmt(t.refunded_to_card_total)} · Wallet: {fmt(t.refunded_to_wallet_total)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">INGRESO BOOKVIA (neto)</div>
              <div className="font-semibold text-base text-[#F05D5E]">{fmt(t.bookvia_net)}</div>
              <div className="text-[10px] text-muted-foreground">Com: {fmt(t.bookvia_commission_total)} · Penalty: +{fmt(t.business_penalty_total)} · Fees abs: -{fmt(t.stripe_fees_absorbed_by_bookvia)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Buckets */}
      {(data.buckets || []).map((bucket) => {
        const sty = OVERVIEW_BUCKET_STYLES[bucket.key] || OVERVIEW_BUCKET_STYLES.pending_or_other;
        const Icon = sty.icon;
        return (
          <div key={bucket.key} className={`border-2 rounded-lg ${sty.color}`}>
            <div className={`px-4 py-2 flex items-center justify-between ${sty.text}`}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Icon className={`h-4 w-4 ${sty.accent}`} />
                {bucket.label_es}
              </div>
              <Badge variant="outline" className="bg-white/70">{bucket.count} cita{bucket.count !== 1 ? 's' : ''}</Badge>
            </div>
            <div className="bg-white rounded-b-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-[10px] uppercase text-muted-foreground">
                    <th className="text-left py-1.5 pl-3">Fecha</th>
                    <th className="text-left py-1.5">Cliente</th>
                    <th className="text-left py-1.5">Servicio</th>
                    <th className="text-right py-1.5">Cliente pagó</th>
                    <th className="text-right py-1.5">Refund</th>
                    <th className="text-right py-1.5">Al negocio</th>
                    <th className="text-right py-1.5 pr-3">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {bucket.items.map((item, idx) => (
                    <tr key={item.booking_id || idx} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 pl-3 font-mono text-[10px]">{item.date} {item.time}</td>
                      <td className="py-1.5">{item.client_name}</td>
                      <td className="py-1.5">{item.service_name}</td>
                      <td className="py-1.5 text-right">
                        {fmt(item.client_paid)}
                        {item.is_hybrid && <Badge variant="outline" className="ml-1 text-[9px] bg-violet-100">híbrido</Badge>}
                      </td>
                      <td className="py-1.5 text-right">
                        {item.refund_amount > 0 ? (
                          <span className={item.refund_to === 'wallet' ? 'text-violet-700' : 'text-blue-700'}>
                            {fmt(item.refund_amount)}
                            <span className="text-[9px] block opacity-75">→{item.refund_to || '—'}</span>
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-1.5 text-right">
                        {item.business_net > 0 ? (
                          <span className="text-emerald-700 font-semibold">+{fmt(item.business_net)}</span>
                        ) : item.business_penalty > 0 ? (
                          <span className="text-rose-700 font-semibold">-{fmt(item.business_penalty)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <span className="text-[10px] text-muted-foreground">
                          Stripe: {fmt(item.stripe_fee)} · Bookvia: {fmt(item.bookvia_fee)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {(!data.buckets || data.buckets.length === 0) && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No hay actividad en este período para este negocio.
        </div>
      )}

      {/* Estado actual del negocio */}
      <div className="bg-slate-50 border rounded-lg p-3 text-xs">
        <div className="font-semibold mb-1">Estado actual del negocio:</div>
        <div className="grid grid-cols-2 gap-2">
          <div>Saldo pendiente (próximo settlement): <span className="font-mono">{fmt(cur.pending_balance)}</span></div>
          <div>Deuda acumulada por cancelaciones (penalty): <span className="font-mono text-rose-700">{fmt(cur.penalty_balance)}</span></div>
        </div>
        {cur.penalty_balance > 0 && (
          <div className="mt-2 text-rose-700 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>Este monto se descontará automáticamente del próximo settlement antes de pagarle al negocio.</span>
          </div>
        )}
      </div>
    </div>
  );
}


const SITUATION_BADGES = {
  ATASCADO: { label: 'ATASCADA', cn: 'bg-rose-100 text-rose-800 border-rose-300' },
  esperando_grace_24h: { label: 'Esperando 24h', cn: 'bg-amber-100 text-amber-800 border-amber-300' },
  listo_para_proximo_corte: { label: 'Lista para corte', cn: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  ya_liquidado: { label: 'Ya liquidada', cn: 'bg-slate-100 text-slate-700 border-slate-300' },
};

function StuckCancellationsView({ items, onInspect }) {
  const stuck = items.filter((i) => i.situation === 'ATASCADO');
  const waiting = items.filter((i) => i.situation === 'esperando_grace_24h');
  const ready = items.filter((i) => i.situation === 'listo_para_proximo_corte');
  const paid = items.filter((i) => i.situation === 'ya_liquidado');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-2">
          <div className="text-2xl font-bold text-rose-700">{stuck.length}</div>
          <div className="text-[10px] text-rose-700 uppercase">ATASCADAS</div>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
          <div className="text-2xl font-bold text-amber-700">{waiting.length}</div>
          <div className="text-[10px] text-amber-700 uppercase">Esperando 24h</div>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
          <div className="text-2xl font-bold text-emerald-700">{ready.length}</div>
          <div className="text-[10px] text-emerald-700 uppercase">Listas para corte</div>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
          <div className="text-2xl font-bold text-slate-700">{paid.length}</div>
          <div className="text-[10px] text-slate-700 uppercase">Ya liquidadas</div>
        </div>
      </div>

      <div className="space-y-2">
        {[...stuck, ...waiting, ...ready, ...paid].map((it) => {
          const badge = SITUATION_BADGES[it.situation] || SITUATION_BADGES.ATASCADO;
          return (
            <div key={it.transaction_id}
                 className="rounded-lg border p-3 flex items-start justify-between gap-3"
                 data-testid={`stuck-item-${it.transaction_id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={badge.cn}>{badge.label}</Badge>
                  <div className="font-medium truncate">{it.client_name || '—'}</div>
                  <div className="text-sm font-semibold text-emerald-700">${it.amount_owed}</div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Negocio: <strong>{it.business_name}</strong></div>
                  <div>Cita: {it.date} {it.time} · {it.service_name}</div>
                  <div className="font-mono text-[10px]">
                    tx_status={it.transaction_status} · funds_state={it.funds_state || '(none)'} · settlement_id={it.settlement_id || '—'}
                  </div>
                  {it.funds_clears_at && (
                    <div>Libera automatico: <strong>{it.funds_clears_at.slice(0, 16).replace('T', ' ')}</strong></div>
                  )}
                </div>
              </div>
              {it.situation === 'ATASCADO' && (
                <Button size="sm" variant="outline"
                        className="shrink-0 text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => onInspect(it.transaction_id)}
                        data-testid={`inspect-tx-${it.transaction_id}`}>
                  <Eye className="h-3 w-3 mr-1" /> Investigar
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


const RECOMMENDATION_STYLE = {
  FIX_LOCAL_STATE: { color: 'emerald', label: 'SEGURO: Stripe confirma que SI se pago' },
  DELETE_ABANDONED_BOOKING: { color: 'rose', label: 'BORRAR: cliente nunca completo el pago' },
  WAIT_OR_ASK_CLIENT: { color: 'amber', label: 'ESPERAR: pago aun puede completarse' },
  ADMIN_REVIEW: { color: 'slate', label: 'REVISION MANUAL' },
};

function TxInspectView({ data, onForceClear, onDeleteAbandoned }) {
  const { transaction, booking, business, user, stripe, recommendation } = data;
  const recStyle = RECOMMENDATION_STYLE[recommendation?.action] || RECOMMENDATION_STYLE.ADMIN_REVIEW;
  const cn = {
    emerald: 'bg-emerald-50 border-emerald-300 text-emerald-900',
    rose: 'bg-rose-50 border-rose-300 text-rose-900',
    amber: 'bg-amber-50 border-amber-300 text-amber-900',
    slate: 'bg-slate-50 border-slate-300 text-slate-900',
  }[recStyle.color];

  return (
    <div className="space-y-4 text-sm">
      {/* Recommendation banner */}
      <div className={`rounded-lg border-2 p-4 ${cn}`}>
        <div className="font-bold text-base mb-1">{recStyle.label}</div>
        <div className="text-xs leading-relaxed">{recommendation?.explanation}</div>
      </div>

      {/* Context */}
      <div className="rounded-lg border p-3 space-y-1">
        <div><strong>Cliente:</strong> {user?.full_name || '—'} ({user?.email || '—'})</div>
        <div><strong>Negocio:</strong> {business?.name || '—'}</div>
        <div><strong>Cita:</strong> {booking?.date} {booking?.time} · {booking?.service_name || ''}</div>
        <div><strong>Monto adeudado:</strong> ${transaction?.business_amount || transaction?.payout_amount || 0}</div>
      </div>

      {/* Local state */}
      <div className="rounded-lg border p-3 space-y-1 bg-slate-50">
        <div className="font-semibold text-slate-700 mb-1">Estado en Bookvia (DB)</div>
        <div className="font-mono text-xs">tx_status: <strong>{transaction?.status || '(none)'}</strong></div>
        <div className="font-mono text-xs">funds_state: <strong>{transaction?.funds_state || '(none)'}</strong></div>
        <div className="font-mono text-xs">stripe_payment_intent_id: <strong>{transaction?.stripe_payment_intent_id || transaction?.payment_intent_id || '(none)'}</strong></div>
        <div className="font-mono text-xs">booking_status: <strong>{booking?.status || '(none)'}</strong></div>
      </div>

      {/* Stripe state */}
      <div className={`rounded-lg border p-3 space-y-1 ${stripe?.present ? 'bg-violet-50' : 'bg-slate-50'}`}>
        <div className="font-semibold mb-1">Estado en Stripe</div>
        {!stripe?.present && (
          <div className="text-xs text-slate-600">
            {stripe?.error ? `Error consultando Stripe: ${stripe.error}` : 'Sin payment_intent_id — el checkout nunca se inicio en Stripe.'}
          </div>
        )}
        {stripe?.present && (
          <>
            <div className="font-mono text-xs">id: <strong>{stripe.id}</strong></div>
            <div className="font-mono text-xs">status: <strong>{stripe.status || (stripe.paid ? 'paid' : 'unpaid')}</strong></div>
            <div className="font-mono text-xs">amount: ${stripe.amount} · received: ${stripe.amount_received ?? '—'}</div>
            {stripe.last_payment_error && (
              <div className="text-xs text-rose-700">Error del cliente: {stripe.last_payment_error}</div>
            )}
            <div className="text-xs mt-2 font-semibold">{stripe.interpretation}</div>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        {recommendation?.safe_to_force_clear && (
          <Button
            onClick={() => onForceClear(transaction.id)}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="confirm-force-clear">
            <Zap className="h-4 w-4 mr-1" /> Forzar a CLEARED
          </Button>
        )}
        {recommendation?.action === 'DELETE_ABANDONED_BOOKING' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50"
                      data-testid="confirm-delete-abandoned">
                <XCircle className="h-4 w-4 mr-1" /> Eliminar cita abandonada
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar cita y transaccion abandonadas</AlertDialogTitle>
                <AlertDialogDescription>
                  El cliente nunca completo el pago en Stripe. Esta cita y su transaccion
                  son basura y NO representan dinero real. Se borraran ambas definitivamente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-rose-600 hover:bg-rose-700"
                  onClick={() => onDeleteAbandoned(transaction.id)}>
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
