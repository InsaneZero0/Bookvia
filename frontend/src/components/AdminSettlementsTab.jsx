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
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Banknote, Zap, FileDown, Play, AlertTriangle, CheckCircle2,
  Clock, XCircle, Lock, RefreshCcw, Calendar,
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

  const exportSpei = (bank = 'generic') => {
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/admin/settlements/${period}/export-spei.csv?bank=${bank}`;
    window.open(url, '_blank');
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
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={generateDay20} disabled={busy} data-testid="generate-day20-btn">
            <Calendar className="h-4 w-4 mr-2" />
            Generar liquidaciones del periodo
          </Button>

          <Button variant="outline" disabled={busy} data-testid="diagnose-funds-btn"
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api.get('/admin/finance/funds-state-summary');
                const s = res.data.summary || {};
                const pending = res.data.pending_completion_count || 0;
                const lines = [];
                Object.entries(s).forEach(([state, info]) => {
                  lines.push(`${state}: ${info.count} tx ($${info.total_payout_mxn})`);
                });
                if (pending > 0) lines.push(`${pending} citas confirmadas con fecha pasada (esperando completar)`);
                toast(lines.join(' · ') || 'Sin transacciones', { duration: 12000 });
              } catch (e) {
                toast.error(e?.response?.data?.detail || 'Error al diagnosticar');
              } finally {
                setBusy(false);
              }
            }}>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Diagnosticar fondos
          </Button>

          <Button variant="outline" disabled={busy} data-testid="debug-cleared-btn"
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api.get('/admin/finance/cleared-transactions-debug');
                const txs = res.data.items || [];
                if (txs.length === 0) {
                  toast('No hay transacciones CLEARED', { duration: 8000 });
                  return;
                }
                const groups = {};
                txs.forEach(tx => {
                  const k = tx.would_skip ? (tx.skip_reasons[0] || 'unknown') : 'OK';
                  if (!groups[k]) groups[k] = { count: 0, amount: 0 };
                  groups[k].count += 1;
                  groups[k].amount += tx.business_amount || tx.payout_amount || 0;
                });
                const lines = Object.entries(groups).map(([reason, info]) =>
                  `${reason}: ${info.count} tx ($${info.amount.toFixed(2)})`
                );
                toast(lines.join(' | '), { duration: 20000 });
                console.log('Cleared transactions debug:', txs);
              } catch (e) {
                toast.error(e?.response?.data?.detail || 'Error');
              } finally {
                setBusy(false);
              }
            }}>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Por qué no liquidan
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={busy} data-testid="repair-uninit-btn" className="border-blue-300 text-blue-800 hover:bg-blue-50">
                <RefreshCcw className="h-4 w-4 mr-2" />
                Inicializar fondos
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reparar transacciones sin funds_state</AlertDialogTitle>
                <AlertDialogDescription>
                  Las transacciones pagadas que NO tienen funds_state asignado se quedan atoradas y nunca llegan a CLEARED.
                  Este botón las inicializa en PENDING_HOLD. Después usa Auto-completar y Forzar liberación para llevarlas a CLEARED.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await api.post('/admin/finance/repair-uninitialized-transactions');
                    toast.success(`${res.data.initialized} transacciones inicializadas (de ${res.data.scanned})`);
                    await load();
                  } catch (e) {
                    toast.error(e?.response?.data?.detail || 'Error');
                  } finally {
                    setBusy(false);
                  }
                }}>Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={busy} data-testid="release-orphan-btn" className="border-purple-300 text-purple-800 hover:bg-purple-50">
                <RefreshCcw className="h-4 w-4 mr-2" />
                Liberar huérfanas
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Liberar transacciones con settlement_id huérfano</AlertDialogTitle>
                <AlertDialogDescription>
                  Encuentra transacciones CLEARED cuyo settlement_id apunta a una liquidación que YA NO EXISTE
                  (porque fue borrada/archivada). Les quita el settlement_id para que el próximo corte las tome.
                  Úsalo cuando "Por qué no liquidan" muestra "already settled in XXX" pero esos IDs no aparecen en ningún periodo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await api.post('/admin/finance/release-orphan-settled-transactions');
                    toast.success(`${res.data.released} transacciones liberadas · $${res.data.total_amount_now_settleable} disponibles para nuevo corte`);
                    await load();
                  } catch (e) {
                    toast.error(e?.response?.data?.detail || 'Error');
                  } finally {
                    setBusy(false);
                  }
                }}>Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={busy} data-testid="auto-complete-btn" className="border-amber-300 text-amber-800 hover:bg-amber-50">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Auto-completar citas pasadas
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Auto-completar citas vencidas</AlertDialogTitle>
                <AlertDialogDescription>
                  Marcará como "completed" todas las citas confirmadas cuya fecha+hora ya pasó (más de 24h).
                  Esto mueve sus fondos de PENDING_HOLD → AVAILABLE para que puedan liquidarse.
                  No se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await api.post('/admin/finance/auto-complete-past-bookings?hours=24');
                    toast.success(`${res.data.completed} citas marcadas como completadas (de ${res.data.scanned})`);
                    await load();
                  } catch (e) {
                    toast.error(e?.response?.data?.detail || 'Error');
                  } finally {
                    setBusy(false);
                  }
                }}>Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={busy} data-testid="force-clear-btn" className="border-amber-300 text-amber-800 hover:bg-amber-50">
                <RefreshCcw className="h-4 w-4 mr-2" />
                Forzar liberación (skip 24h grace)
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Forzar liberación de fondos AVAILABLE → CLEARED</AlertDialogTitle>
                <AlertDialogDescription>
                  Saltará la ventana de gracia de 24h y moverá todas las transacciones en estado
                  AVAILABLE a CLEARED para que se incluyan en la liquidación de este periodo.
                  Úsalo solo si necesitas liquidar HOY. No se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await api.post('/admin/finance/force-clear-available?skip_grace=true');
                    toast.success(`${res.data.cleared} transacciones liberadas (de ${res.data.scanned})`);
                    await load();
                  } catch (e) {
                    toast.error(e?.response?.data?.detail || 'Error');
                  } finally {
                    setBusy(false);
                  }
                }}>Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
                      <tr key={row.settlement_id} className="border-b hover:bg-muted/30"
                          data-testid={`settlement-row-${row.settlement_id}`}>
                        <td className="py-3">
                          <div className="font-medium">{row.business_name}</div>
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
                        <td className="py-3 text-right">
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
    </div>
  );
}
