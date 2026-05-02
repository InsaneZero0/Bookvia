import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, ChevronRight, Loader2, ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n';
import { usersAPI } from '@/lib/api';

const TX_LABELS = {
  credit_cancellation: { es: 'Reembolso por cancelacion', en: 'Cancellation refund' },
  credit_business_cancel: { es: 'Reembolso por cancelacion del negocio', en: 'Business cancellation refund' },
  credit_admin: { es: 'Ajuste de Bookvia', en: 'Bookvia adjustment' },
  credit_business_no_show: { es: 'Compensacion por negocio cerrado', en: 'Closed business compensation' },
  debit_booking: { es: 'Reserva pagada con saldo', en: 'Booking paid with wallet' },
  debit_expired: { es: 'Saldo expirado', en: 'Wallet expired' },
  debit_refund_to_card: { es: 'Reembolso a tarjeta', en: 'Refund to card' },
};

function formatMXN(n) {
  return `$${(Number(n) || 0).toFixed(2)} MXN`;
}

function formatDate(iso, language) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function getTxLabel(type, language) {
  const lbl = TX_LABELS[type];
  if (!lbl) return type;
  return lbl[language] || lbl.es;
}

export function WalletCard({ compact = false }) {
  const { language } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await usersAPI.getWallet();
      setData(res.data);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card data-testid="wallet-card-loading">
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const balance = Number(data?.balance || 0);
  const expiresAt = data?.expires_at;

  return (
    <>
      <Card data-testid="wallet-card" className="bg-gradient-to-br from-[#F05D5E] to-[#FF7B7C] text-white border-none overflow-hidden relative">
        <CardContent className={compact ? 'p-3' : 'p-5'}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 rounded-lg p-2">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-white/70 font-semibold">
                  {language === 'es' ? 'Saldo Bookvia' : 'Bookvia Wallet'}
                </p>
                <p className="text-2xl font-extrabold leading-tight" data-testid="wallet-balance">
                  {formatMXN(balance)}
                </p>
              </div>
            </div>
            {balance > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(true)}
                className="text-white hover:bg-white/15 h-7 px-2 text-xs"
                data-testid="wallet-history-btn"
              >
                {language === 'es' ? 'Ver historial' : 'History'}
                <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            )}
          </div>
          {balance > 0 && expiresAt && (
            <div className="flex items-center gap-1 text-[11px] text-white/80 mt-2">
              <Clock className="h-3 w-3" />
              <span>
                {language === 'es' ? 'Expira el' : 'Expires on'} {formatDate(expiresAt, language)}
              </span>
            </div>
          )}
          {balance === 0 && (
            <p className="text-[11px] text-white/80 mt-2">
              {language === 'es'
                ? 'Cuando canceles una cita o recibas una compensacion, tu saldo aparecera aqui.'
                : 'When you cancel an appointment or receive compensation, your balance will show here.'}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg" data-testid="wallet-history-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#F05D5E]" />
              {language === 'es' ? 'Historial de saldo Bookvia' : 'Bookvia Wallet History'}
            </DialogTitle>
            <DialogDescription>
              {language === 'es'
                ? 'Movimientos recientes de tu saldo. Tu saldo se mantiene activo mientras lo uses cada 24 meses.'
                : 'Recent activity in your wallet. Balance stays active as long as you use it within 24 months.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {data?.transactions?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {language === 'es' ? 'Aun no tienes movimientos' : 'No transactions yet'}
              </p>
            )}
            {data?.transactions?.map((tx) => {
              const isCredit = tx.direction === 'credit';
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50"
                  data-testid={`wallet-tx-${tx.id}`}
                >
                  <div className={`rounded-full p-1.5 ${isCredit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {isCredit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getTxLabel(tx.type, language)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.created_at, language)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${isCredit ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {isCredit ? '+' : '-'}{formatMXN(tx.amount)}
                    </p>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {language === 'es' ? 'Saldo' : 'Bal.'}: {formatMXN(tx.balance_after)}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default WalletCard;
