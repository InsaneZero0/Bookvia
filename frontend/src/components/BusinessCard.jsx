import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StarRating } from '@/components/StarRating';
import { useI18n } from '@/lib/i18n';
import { formatCurrency } from '@/lib/utils';
import { MapPin, Clock, Heart } from 'lucide-react';

const titleCase = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
};

const isReallyNew = (createdAt) => {
  if (!createdAt) return false;
  try {
    const created = new Date(createdAt).getTime();
    const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
    return ageDays >= 0 && ageDays <= 14;
  } catch {
    return false;
  }
};

export function BusinessCard({ business, onFavorite, isFavorite = false }) {
  const { t, language } = useI18n();

  return (
    <Card 
      className="group overflow-hidden border border-border/50 hover:border-[#F05D5E]/30 card-hover"
      data-testid={`business-card-${business.id}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={business.cover_photo || business.photos?.[0] || business.logo_url || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400'}
          alt={business.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        
        {/* Badges - only show if truly relevant */}
        <div className="absolute top-3 left-3 flex gap-2">
          {(business.badges?.includes('nuevo') || isReallyNew(business.created_at)) && (
            <Badge className="bg-[#F05D5E] text-white border-0">
              {t('badge.new')}
            </Badge>
          )}
          {business.badges?.includes('verificado') && (
            <Badge className="bg-green-500 text-white border-0">
              {t('badge.verified')}
            </Badge>
          )}
          {business.is_featured && (
            <Badge className="bg-yellow-500 text-white border-0">
              {t('badge.featured')}
            </Badge>
          )}
        </div>

        {/* Favorite Button */}
        {onFavorite && (
          <button
            onClick={(e) => { e.preventDefault(); onFavorite(business.id); }}
            className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white transition-colors"
            data-testid={`favorite-btn-${business.id}`}
          >
            <Heart 
              className={`h-5 w-5 transition-colors ${
                isFavorite ? 'fill-[#F05D5E] text-[#F05D5E]' : 'text-slate-600'
              }`} 
            />
          </button>
        )}

        {/* Rating only - category moved into content area */}
        {business.rating > 0 && (
          <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1 shadow-sm">
            <StarRating rating={business.rating} showValue={false} size="small" />
            <span className="text-xs font-bold text-slate-900">{business.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {business.category_name}
            </span>
          </div>
          <Link to={`/business/${business.slug}`}>
            <h3 className="font-heading font-bold text-lg hover:text-[#F05D5E] transition-colors line-clamp-1">
              {titleCase(business.name)}
            </h3>
          </Link>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {business.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            <span className="line-clamp-1 text-xs">{business.city}</span>
          </div>
          {business.is_open_now != null && (
            <span className={`flex items-center gap-1 text-xs font-medium ${business.is_open_now ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${business.is_open_now ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {business.is_open_now ? (language === 'es' ? 'Abierto' : 'Open') : (language === 'es' ? 'Cerrado' : 'Closed')}
            </span>
          )}
          {business.distance_km != null && (
            <span className="text-xs font-medium text-[#F05D5E]">
              {business.distance_km < 1 ? `${Math.round(business.distance_km * 1000)}m` : `${business.distance_km} km`}
            </span>
          )}
          {business.next_available_text && !business.is_open_now && (
            <div className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Clock className="h-3 w-3" />
              <span>{business.next_available_text}</span>
            </div>
          )}
          {business.review_count > 0 && (
            <span className="text-xs">
              ({business.review_count} {t('business.reviews')})
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div>
            <span className="text-xs text-muted-foreground">{t('common.from')}</span>
            <span className="font-bold text-lg ml-1">
              {formatCurrency(business.min_price || 299, 'MXN')}
            </span>
          </div>
          <Button asChild className="btn-coral text-sm px-4 py-2" data-testid={`book-btn-${business.id}`}>
            <Link to={`/business/${business.slug}`}>
              {t('business.bookNow')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
