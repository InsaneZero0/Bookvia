import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { adminAPI } from '@/lib/api';
import { Download, Copy, QrCode, Search, ExternalLink, RefreshCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Phase I — Branded QR codes management tab (Admin only).
 *
 * Lets staff browse every approved business, preview the coral Bookvia QR,
 * download/copy two formats (raw QR and printable card with name + code),
 * and track scan counts coming from `?ref=qr` query param.
 */
export default function AdminQRCodesTab() {
  const API_BASE = process.env.REACT_APP_BACKEND_URL || '';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [days, setDays] = useState(30);
  const [totalScans, setTotalScans] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0); // cache-bust the <img>

  const load = async () => {
    setLoading(true);
    try {
      const [bizRes, sumRes] = await Promise.all([
        adminAPI.getQrBusinesses({ q: q || undefined, limit: 200, days }),
        adminAPI.getQrScansSummary(days),
      ]);
      setItems(bizRes.data?.items || []);
      setTotalScans(sumRes.data?.total_scans || 0);
    } catch (e) {
      toast.error('No se pudieron cargar los códigos QR');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const needle = q.toLowerCase();
    return items.filter(b =>
      (b.name || '').toLowerCase().includes(needle) ||
      (b.slug || '').toLowerCase().includes(needle) ||
      (b.public_code || '').toLowerCase().includes(needle) ||
      (b.city || '').toLowerCase().includes(needle)
    );
  }, [items, q]);

  const buildUrl = (path) => `${API_BASE}${path}?v=${refreshKey}`;

  const handleDownload = async (path, filename) => {
    try {
      const res = await fetch(`${API_BASE}${path}`);
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('No se pudo descargar el QR');
    }
  };

  const handleCopyImage = async (path) => {
    try {
      const res = await fetch(`${API_BASE}${path}`);
      const blob = await res.blob();
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast.success('Imagen QR copiada al portapapeles');
      } else {
        // Fallback: copy URL
        await navigator.clipboard.writeText(`${API_BASE}${path}`);
        toast.success('URL del QR copiada (tu navegador no soporta copiar imágenes)');
      }
    } catch (e) {
      toast.error('No se pudo copiar el QR');
    }
  };

  const handleCopyLink = async (slug) => {
    try {
      const link = `${window.location.origin}/${slug}?ref=qr`;
      await navigator.clipboard.writeText(link);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-qr-tab">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-[#F05D5E]" />
                Códigos QR de negocios
              </CardTitle>
              <CardDescription>
                Imágenes brandeadas (coral + logo Bookvia) que cada negocio puede imprimir como sticker.
                Cada escaneo se rastrea automáticamente vía <code className="text-xs bg-muted px-1 rounded">?ref=qr</code>.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="h-3 w-3" />
                {totalScans} escaneos · últimos {days} días
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setRefreshKey(k => k + 1); load(); }}
                data-testid="qr-refresh-btn"
              >
                <RefreshCcw className="h-4 w-4 mr-1" /> Refrescar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, slug, código o ciudad"
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="qr-search-input"
              />
            </div>
            <div className="flex items-center gap-1 text-sm">
              {[7, 30, 90].map(d => (
                <Button
                  key={d}
                  variant={days === d ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDays(d)}
                  data-testid={`qr-days-${d}`}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} className="h-72 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="qr-empty">
              No hay negocios aprobados que coincidan con tu búsqueda.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="qr-grid">
              {filtered.map(biz => (
                <Card key={biz.id} className="overflow-hidden border-2 hover:border-[#F05D5E]/40 transition-colors" data-testid={`qr-card-${biz.id}`}>
                  <div className="aspect-square bg-white flex items-center justify-center p-4 border-b">
                    <img
                      src={buildUrl(biz.qr_png_url)}
                      alt={`QR ${biz.name}`}
                      className="max-w-full max-h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <div className="font-semibold truncate" title={biz.name}>{biz.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{biz.public_code || '—'}</span>
                        {biz.city ? <><span>·</span><span className="truncate">{biz.city}</span></> : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <Badge variant="secondary" data-testid={`qr-scans-${biz.id}`}>
                        {biz.scans} escaneo{biz.scans === 1 ? '' : 's'}
                      </Badge>
                      <a
                        href={`/${biz.slug}?ref=qr`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-[#F05D5E] inline-flex items-center gap-1"
                      >
                        Ver perfil <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(biz.qr_png_url, `bookvia-qr-${biz.slug}.png`)}
                        data-testid={`qr-download-png-${biz.id}`}
                      >
                        <Download className="h-3 w-3 mr-1" /> QR
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#F05D5E] hover:bg-[#d94e4f] text-white"
                        onClick={() => handleDownload(biz.qr_card_url, `bookvia-qr-card-${biz.slug}.png`)}
                        data-testid={`qr-download-card-${biz.id}`}
                      >
                        <Download className="h-3 w-3 mr-1" /> Tarjeta
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyImage(biz.qr_png_url)}
                        data-testid={`qr-copy-img-${biz.id}`}
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copiar img
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyLink(biz.slug)}
                        data-testid={`qr-copy-link-${biz.id}`}
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copiar link
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">¿Cómo se usan?</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Descarga el QR del negocio (PNG transparente, 512px) o la tarjeta imprimible (incluye nombre + código público).</li>
            <li>Envíaselo al negocio para que lo imprima como sticker, lo agregue a su menú o lo coloque en recepción.</li>
            <li>Cada vez que alguien lo escanee, registramos el evento — verás el contador actualizarse aquí.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
