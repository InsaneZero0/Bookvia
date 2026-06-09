import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Database, Download, CheckCircle2, XCircle, PlayCircle, Clock, RefreshCcw, Cloud } from 'lucide-react';

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

export default function AdminBackupsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/backups/list', { params: { limit: 30 } });
      setItems(res.data?.items || []);
    } catch {
      toast.error('No se pudo cargar la lista de backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/admin/backups/list', { params: { limit: 30 } });
        if (!cancelled) setItems(res.data?.items || []);
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la lista de backups');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const trigger = async () => {
    setBusy(true);
    try {
      const res = await api.post('/admin/backups/trigger');
      if (res.data?.upload_ok) {
        toast.success(`Backup creado: ${res.data.total_docs} docs · ${res.data.size_mb} MB`);
      } else {
        toast.warning('Backup creado pero NO se subió a Cloudinary (verifica las credenciales)');
      }
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al crear backup');
    } finally {
      setBusy(false);
    }
  };

  const [renderTime] = useState(() => Date.now());
  const latest = items[0];
  const lastOk = useMemo(() => items.find(b => b.upload_ok), [items]);
  const hoursSinceLast = useMemo(() => {
    if (!lastOk) return null;
    return Math.floor((renderTime - new Date(lastOk.created_at).getTime()) / 3600000);
  }, [lastOk, renderTime]);

  return (
    <div className="space-y-6" data-testid="admin-backups-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Database className="h-6 w-6 text-[#F05D5E]" />
            Backups MongoDB
          </h2>
          <p className="text-sm text-muted-foreground">
            Snapshot diario automático de toda la base de datos a Cloudinary (retención 30 días)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} data-testid="backup-refresh">
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button onClick={trigger} disabled={busy} className="bg-[#F05D5E] hover:bg-[#d94e4f] text-white" data-testid="backup-trigger-btn">
            <PlayCircle className="h-4 w-4 mr-2" />
            {busy ? 'Creando...' : 'Crear backup ahora'}
          </Button>
        </div>
      </div>

      {/* Health card */}
      <Card className={hoursSinceLast === null
          ? 'border-amber-200 bg-amber-50/50'
          : hoursSinceLast < 26 ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}>
        <CardContent className="pt-6 flex items-center gap-4">
          {hoursSinceLast === null ? (
            <>
              <Clock className="h-10 w-10 text-amber-600" />
              <div>
                <div className="font-semibold">Aún no hay backups exitosos</div>
                <div className="text-sm text-muted-foreground">
                  El scheduler corre cada 24h. También puedes crear uno manual con el botón de arriba.
                </div>
              </div>
            </>
          ) : hoursSinceLast < 26 ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <div>
                <div className="font-semibold">Backup reciente — hace {hoursSinceLast}h</div>
                <div className="text-sm text-muted-foreground">
                  Tu base de datos está protegida. Último backup OK: {fmtDate(lastOk.created_at)}
                </div>
              </div>
            </>
          ) : (
            <>
              <XCircle className="h-10 w-10 text-red-600" />
              <div>
                <div className="font-semibold">⚠️ Backup desactualizado — hace {hoursSinceLast}h</div>
                <div className="text-sm text-muted-foreground">
                  Han pasado más de 26h sin un backup exitoso. Revisa los logs y créalo manual.
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Historial</CardTitle>
          <CardDescription>Últimos 30 snapshots — descarga el JSON.gz desde Cloudinary</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground" data-testid="empty-backups">
              No hay backups todavía. Click &quot;Crear backup ahora&quot; para generar el primero.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Fecha</th>
                    <th className="py-2 text-right">Docs</th>
                    <th className="py-2 text-right">Tamaño</th>
                    <th className="py-2">Estado</th>
                    <th className="py-2 text-right">Descargar</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(b => (
                    <tr key={b.id} className="border-b hover:bg-muted/30" data-testid={`backup-row-${b.id}`}>
                      <td className="py-3">
                        <div className="font-medium">{fmtDate(b.created_at)}</div>
                        <div className="text-xs text-muted-foreground">{b.id}</div>
                      </td>
                      <td className="py-3 text-right">{b.total_docs?.toLocaleString('es-MX') || '—'}</td>
                      <td className="py-3 text-right">{b.size_mb ? `${b.size_mb} MB` : '—'}</td>
                      <td className="py-3">
                        {b.upload_ok ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
                            <Cloud className="h-3 w-3" />En Cloudinary
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100 gap-1">
                            <XCircle className="h-3 w-3" />Falló subida
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {b.cloudinary_url ? (
                          <a href={b.cloudinary_url} target="_blank" rel="noopener noreferrer"
                             className="text-[#F05D5E] hover:underline text-xs inline-flex items-center gap-1">
                            <Download className="h-3 w-3" /> .json.gz
                          </a>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="p-4 text-sm space-y-2">
          <p className="font-medium">Cómo restaurar un backup</p>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>Descarga el archivo .json.gz desde el botón &quot;Descargar&quot;.</li>
            <li>Descomprime: <code className="text-xs bg-background px-1 rounded">gunzip backup.json.gz</code></li>
            <li>El archivo contiene un JSON con todas las colecciones. Usa el script <code className="text-xs">scripts/restore_backup.py</code> o herramientas como mongoimport para reinyectar.</li>
            <li>Para restauración completa de la DB, contacta a tu administrador de Mongo (ej. Atlas Support).</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
