import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { usersAPI } from '@/lib/api';
import { getInitials, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Heart, MapPin, Star, Clock, Search, Trash2, ExternalLink, ChevronRight
} from 'lucide-react';

export default function FavoritesPage() {
  const { language } = useI18n();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    // Wait for auth to finish loading before checking authentication
    if (authLoading) return;
    if (!isAuthenticated) { navigate('/login'); return; }
    loadFavorites();
  }, [isAuthenticated, authLoading]);

  const loadFavorites = async () => {
    try {
      const res = await usersAPI.getFavorites();
      setFavorites(Array.isArray(res.data) ? res.data : []);
    } catch {
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (businessId, businessName) => {
    setRemoving(businessId);
    try {
      await usersAPI.removeFavorite(businessId);
      setFavorites(prev => prev.filter(b => b.id !== businessId));
      toast.success(
        language === 'es'
          ? `${businessName} eliminado de favoritos`
          : `${businessName} removed from favorites`
      );
    } catch {
      toast.error(language === 'es' ? 'Error al eliminar' : 'Error removing');
    } finally {
      setRemoving(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32 mb-8" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-40" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="favorites-page">
      <div className="container-app py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold flex items-center gap-2">
              <Heart className="h-7 w-7 text-[#F05D5E] fill-[#F05D5E]" />
              {language === 'es' ? 'Mis Favoritos' : 'My Favorites'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {favorites.length} {language === 'es'
                ? (favorites.length === 1 ? 'negocio guardado' : 'negocios guardados')
                : (favorites.length === 1 ? 'saved business' : 'saved businesses')}
            </p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => navigate('/search')}>
            <Search className="h-4 w-4" />
            {language === 'es' ? 'Explorar más' : 'Explore more'}
          </Button>
        </div>

        {/* Empty State */}
        {favorites.length === 0 && (
          <div className="text-center py-20" data-testid="favorites-empty">
            <div className="w-20 h-20 rounded-full bg-[#F05D5E]/10 flex items-center justify-center mx-auto mb-5">
              <Heart className="h-10 w-10 text-[#F05D5E]/40" />
            </div>
            <h2 className="text-xl font-heading font-bold mb-2">
              {language === 'es' ? 'Aún no tienes favoritos' : 'No favorites yet'}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {language === 'es'
                ? 'Explora negocios y guarda los que más te gusten para encontrarlos rápidamente.'
                : 'Explore businesses and save the ones you like to find them quickly.'}
            </p>
            <Button className="btn-coral" onClick={() => navigate('/search')}>
              <Search className="h-4 w-4 mr-2" />
              {language === 'es' ? 'Explorar negocios' : 'Explore businesses'}
            </Button>
          </div>
        )}

        {/* Favorites Grid */}
        {favorites.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="favorites-grid">
            {favorites.map(biz => (
              <Card
                key={biz.id}
                className="group overflow-hidden border border-border/50 hover:border-[#F05D5E]/30 hover:shadow-md transition-all"
                data-testid={`favorite-card-${biz.id}`}
              >
                {/* Photo */}
                <Link to={`/business/${biz.slug}`} className="block relative h-40 overflow-hidden bg-muted">
                  {(biz.cover_photo || biz.photos?.[0]) ? (
                    <img
                      src={biz.cover_photo || biz.photos[0]}
                      alt={biz.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  {biz.category_name && (
                    <Badge className="absolute bottom-2 left-2 bg-white/90 text-foreground text-[10px] backdrop-blur-sm">
                      {biz.category_name}
                    </Badge>
                  )}
                  {biz.rating > 0 && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm text-xs font-semibold px-2 py-0.5 rounded-full">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {biz.rating.toFixed(1)}
                    </div>
                  )}
                </Link>

                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/business/${biz.slug}`} className="flex-1 min-w-0">
                      <h3 className="font-heading font-bold text-base truncate group-hover:text-[#F05D5E] transition-colors">
                        {biz.name}
                      </h3>
                      {biz.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{biz.description}</p>
                      )}
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => handleRemove(biz.id, biz.name)}
                      disabled={removing === biz.id}
                      data-testid={`remove-favorite-${biz.id}`}
                    >
                      {removing === biz.id ? (
                        <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {biz.city}
                    </span>
                    {biz.is_open_now != null && (
                      <span className={`flex items-center gap-1 font-medium ${biz.is_open_now ? 'text-emerald-600' : 'text-red-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${biz.is_open_now ? 'bg-emerald-500' : 'bg-red-400'}`} />
                        {biz.is_open_now ? (language === 'es' ? 'Abierto' : 'Open') : (language === 'es' ? 'Cerrado' : 'Closed')}
                      </span>
                    )}
                    {biz.next_available_text && !biz.is_open_now && (
                      <span className="flex items-center gap-1 font-medium text-emerald-600">
                        <Clock className="h-3 w-3" />
                        {biz.next_available_text}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                    <span className="text-sm">
                      <span className="text-xs text-muted-foreground">{language === 'es' ? 'Desde' : 'From'} </span>
                      <span className="font-bold text-[#F05D5E]">{formatCurrency(biz.min_price || 299, 'MXN')}</span>
                    </span>
                    <Button asChild size="sm" className="btn-coral text-xs h-8 px-4" data-testid={`book-favorite-${biz.id}`}>
                      <Link to={`/business/${biz.slug}`}>
                        {language === 'es' ? 'Reservar' : 'Book'}
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
