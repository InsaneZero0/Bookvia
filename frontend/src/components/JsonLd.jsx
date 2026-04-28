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
