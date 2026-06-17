import { useEffect } from 'react';

/**
 * Inject Schema.org JSON-LD into the document head.
 * Removes the script on unmount to avoid duplicates when navigating between pages.
 */
export function JsonLd({ data, id }) {
  useEffect(() => {
    if (!data) return undefined;
    const scriptId = id || `jsonld-${Math.random().toString(36).slice(2)}`;
    const existing = document.getElementById(scriptId);
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = scriptId;
    script.text = JSON.stringify(data);
    document.head.appendChild(script);

    return () => {
      const node = document.getElementById(scriptId);
      if (node) node.remove();
    };
  }, [data, id]);

  return null;
}

// Pre-built common schemas
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Bookvia',
  url: 'https://bookvia.app',
  logo: 'https://bookvia.app/logo.png',
  description:
    'Bookvia es una plataforma de reservas de servicios profesionales en Mexico y Estados Unidos. Reservas en segundos, pagos seguros con Stripe, cancelacion gratis hasta 24h antes.',
  sameAs: [],
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'hola@bookvia.app',
    contactType: 'customer support',
    availableLanguage: ['Spanish', 'English'],
    areaServed: ['MX', 'US'],
  },
};

export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Bookvia',
  url: 'https://bookvia.app',
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://bookvia.app/search?q={search_term_string}',
    'query-input': 'required name=search_term_string',
  },
};

export function buildFaqSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
}

/**
 * Build a LocalBusiness JSON-LD object from a Bookvia business document.
 * Powers Google rich results: star ratings, hours, address, services, map link.
 * Returns null when there isn't enough data.
 */
export function buildLocalBusinessSchema(business, services = [], reviews = []) {
  if (!business?.name) return null;

  const slug = business.slug || business.id;
  const city = business.city || business.address?.city || '';
  const country = (business.country_code || 'MX').toLowerCase();
  const citySlug = city.toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.bookvia.app/${country}/${citySlug}/${slug}`;

  const obj = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    url,
    image: business.cover_photo || business.logo_url || undefined,
    description: business.description || undefined,
    priceRange: business.price_range || '$$',
    telephone: business.phone || undefined,
  };

  const addr = business.address || {};
  if (addr.street || addr.colony || business.city) {
    obj.address = {
      '@type': 'PostalAddress',
      streetAddress: [addr.street, addr.exterior_number, addr.colony].filter(Boolean).join(', ') || undefined,
      addressLocality: business.city || addr.city || undefined,
      addressRegion: business.state || addr.state || undefined,
      postalCode: addr.postal_code || undefined,
      addressCountry: business.country_code || 'MX',
    };
  }

  if (business.lat && business.lng) {
    obj.geo = {
      '@type': 'GeoCoordinates',
      latitude: business.lat,
      longitude: business.lng,
    };
  }

  if ((business.rating || 0) > 0 && (business.review_count || 0) > 0) {
    obj.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(business.rating).toFixed(1),
      reviewCount: business.review_count,
      bestRating: '5',
      worstRating: '1',
    };
  }

  const hours = business.hours || business.opening_hours;
  if (hours && typeof hours === 'object') {
    const dayMap = { mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su' };
    const spec = [];
    for (const [day, val] of Object.entries(hours)) {
      const code = dayMap[day.toLowerCase()];
      if (!code || !val) continue;
      if (Array.isArray(val) && val.length === 2) {
        spec.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: code, opens: val[0], closes: val[1] });
      } else if (val.open && val.close) {
        spec.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: code, opens: val.open, closes: val.close });
      }
    }
    if (spec.length) obj.openingHoursSpecification = spec;
  }

  if (services?.length) {
    obj.makesOffer = services.slice(0, 20).map((s) => ({
      '@type': 'Offer',
      name: s.name,
      price: s.price,
      priceCurrency: business.currency_code || 'MXN',
      description: s.description || undefined,
    }));
  }

  if (reviews?.length) {
    obj.review = reviews.slice(0, 5).map((r) => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
      author: { '@type': 'Person', name: r.author_name || r.user_name || 'Cliente' },
      reviewBody: r.comment || undefined,
      datePublished: r.created_at || undefined,
    }));
  }

  Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
  return obj;
}

/**
 * BreadcrumbList JSON-LD — helps Google show the breadcrumb trail in results.
 */
export function buildBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
