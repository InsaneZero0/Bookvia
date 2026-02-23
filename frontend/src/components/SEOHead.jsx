import { useEffect } from 'react';

/**
 * SEOHead component for dynamic meta tags
 * Updates document title and meta tags based on props
 */
export function SEOHead({ 
  title, 
  description, 
  canonical,
  ogTitle,
  ogDescription,
  ogImage = '/og-default.png',
  keywords
}) {
  useEffect(() => {
    // Update title
    if (title) {
      document.title = title;
    }

    // Update or create meta tags
    const updateMeta = (name, content, isProperty = false) => {
      if (!content) return;
      
      const attr = isProperty ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attr}="${name}"]`);
      
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    // Standard meta tags
    updateMeta('description', description);
    updateMeta('keywords', keywords);

    // Open Graph tags
    updateMeta('og:title', ogTitle || title, true);
    updateMeta('og:description', ogDescription || description, true);
    updateMeta('og:image', ogImage, true);
    updateMeta('og:type', 'website', true);

    // Twitter Card tags
    updateMeta('twitter:card', 'summary_large_image');
    updateMeta('twitter:title', ogTitle || title);
    updateMeta('twitter:description', ogDescription || description);
    updateMeta('twitter:image', ogImage);

    // Canonical URL
    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', `${window.location.origin}${canonical}`);
    }

    // Cleanup on unmount
    return () => {
      document.title = 'Bookvia - Reserva servicios profesionales';
    };
  }, [title, description, canonical, ogTitle, ogDescription, ogImage, keywords]);

  return null;
}

export default SEOHead;
