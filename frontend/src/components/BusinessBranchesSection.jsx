import { useEffect, useState } from 'react';
import { MapPin, Phone, ExternalLink, Building2, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

/**
 * Public branches section for the Business Profile page.
 *
 * Lists all active branches of a business so customers can pick the one closest to them.
 * Hides itself if the business only has 1 branch (legacy single-location).
 */
export default function BusinessBranchesSection({ businessId, language = 'es' }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const t = (es, en) => (language === 'es' ? es : en);

  useEffect(() => {
    if (!businessId) return;
    let mounted = true;
    (async () => {
      try {
        const res = await api.get(`/businesses/${businessId}/branches`);
        if (mounted) setBranches(Array.isArray(res.data) ? res.data : []);
      } catch { /* ignore */ }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [businessId]);

  if (loading || branches.length <= 1) return null;

  const openMap = (b) => {
    const query = encodeURIComponent(`${b.name} ${b.address} ${b.city} ${b.state}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="py-6" data-testid="business-branches-section">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="h-5 w-5 text-[#F05D5E]" />
        <h2 className="font-heading font-bold text-lg">
          {t('Nuestras sucursales', 'Our locations')}
        </h2>
        <Badge variant="secondary" className="text-xs">{branches.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {t('Tenemos varias ubicaciones. Elige la más cercana a ti.', 'We have multiple locations. Pick the closest to you.')}
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {branches.map(b => (
          <Card
            key={b.id}
            className="border-border/60 hover:border-[#F05D5E]/40 hover:shadow-md transition-all cursor-pointer group"
            onClick={() => openMap(b)}
            data-testid={`branch-public-card-${b.id}`}
          >
            <CardContent className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm flex-1 min-w-0">{b.name}</h3>
                {b.is_primary && (
                  <Badge className="bg-[#F05D5E] text-white text-[10px] shrink-0">
                    <Star className="h-2.5 w-2.5 mr-1" />
                    {t('Principal', 'Main')}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed">
                <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-[#F05D5E]" />
                <span>{b.address}, {b.city}, {b.state} {b.zip_code}</span>
              </p>
              {b.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-[#F05D5E]" />
                  <a href={`tel:${b.phone}`} onClick={e => e.stopPropagation()} className="hover:text-[#F05D5E]">
                    {b.phone}
                  </a>
                </p>
              )}
              <div className="pt-1 flex items-center gap-1 text-[#F05D5E] text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                <ExternalLink className="h-3 w-3" />
                {t('Ver en Google Maps', 'Open in Google Maps')}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
