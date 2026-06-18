import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, Loader2, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { businessesAPI } from '@/lib/api';
import SmartImage from '@/components/SmartImage';

/**
 * Two side-by-side editors that let the business owner manage:
 *   - LOGO (avatar): square image shown in search cards, profile header and reviews.
 *   - COVER (banner): wide hero image at the top of the public profile page.
 *
 * Both fields are independent from the gallery photos; replacing them only
 * updates the brand visuals, not the photo grid below.
 */
export default function BusinessBrandingSection({ business, onChange, t, language }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6" data-testid="branding-section">
      <BrandImageCard
        title={t('Foto de perfil / Logo', 'Profile photo / Logo')}
        description={t(
          'Se muestra como icono circular en busquedas, perfil y resenas. Recomendado: cuadrado, >= 400 x 400 px.',
          'Shown as a circular avatar in search, profile and reviews. Square image, >= 400 x 400 px recommended.'
        )}
        currentUrl={business?.logo_url}
        shape="circle"
        previewAspect="aspect-square"
        onUpload={async (file) => {
          const res = await businessesAPI.uploadLogo(file);
          return res.data?.secure_url;
        }}
        onRemove={async () => { await businessesAPI.deleteLogo(); }}
        onAfterChange={onChange}
        t={t}
        testidPrefix="logo"
      />
      <BrandImageCard
        title={t('Foto de portada', 'Cover photo')}
        description={t(
          'Banner ancho que aparece arriba de tu perfil publico. Recomendado: 1600 x 600 px (horizontal).',
          'Wide banner at the top of your public profile. 1600 x 600 px (landscape) recommended.'
        )}
        currentUrl={business?.cover_photo}
        shape="rounded"
        previewAspect="aspect-[16/6]"
        onUpload={async (file) => {
          const res = await businessesAPI.uploadCover(file);
          return res.data?.secure_url;
        }}
        onRemove={async () => { await businessesAPI.deleteCover(); }}
        onAfterChange={onChange}
        t={t}
        testidPrefix="cover"
      />
    </div>
  );
}

function BrandImageCard({
  title, description, currentUrl, shape, previewAspect,
  onUpload, onRemove, onAfterChange, t, testidPrefix,
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleSelectFile = () => fileRef.current?.click();

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('Maximo 5MB', 'Max 5MB'));
      return;
    }
    setUploading(true);
    try {
      await onUpload(file);
      toast.success(t('Imagen actualizada', 'Image updated'));
      onAfterChange?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('Error al subir la imagen', 'Failed to upload'));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onRemove();
      toast.success(t('Eliminada', 'Removed'));
      onAfterChange?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('Error', 'Error'));
    } finally {
      setRemoving(false);
    }
  };

  const isCircle = shape === 'circle';

  return (
    <Card className="flex flex-col" data-testid={`branding-${testidPrefix}-card`}>
      <CardHeader>
        <CardTitle className="text-base font-heading">{title}</CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className={`relative ${previewAspect} bg-muted/40 rounded-xl overflow-hidden border ${isCircle ? 'max-w-[200px] mx-auto rounded-full aspect-square' : ''}`}>
          {currentUrl ? (
            <SmartImage
              src={currentUrl}
              name="?"
              alt={title}
              className={`absolute inset-0 w-full h-full object-cover ${isCircle ? 'rounded-full' : ''}`}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-1">
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs">{t('Sin imagen', 'No image')}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jfif"
            className="hidden"
            onChange={handleChange}
            data-testid={`branding-${testidPrefix}-input`}
          />
          <Button
            onClick={handleSelectFile}
            disabled={uploading || removing}
            className="btn-coral"
            size="sm"
            data-testid={`branding-${testidPrefix}-upload-btn`}
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('Subiendo...', 'Uploading...')}</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />{currentUrl ? t('Cambiar', 'Replace') : t('Subir', 'Upload')}</>
            )}
          </Button>
          {currentUrl && (
            <Button
              onClick={handleRemove}
              variant="outline"
              size="sm"
              disabled={uploading || removing}
              data-testid={`branding-${testidPrefix}-remove-btn`}
            >
              {removing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {t('Quitar', 'Remove')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
