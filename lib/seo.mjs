// Shared SEO helpers: one canonical origin, page-specific Open Graph, and
// schema.org JSON-LD. Every value here is derived from existing product copy.
export const SITE_URL = 'https://pincraftly.vercel.app';
export const SITE_NAME = 'PinCraft';
export const OG_IMAGE = '/brand/pincraft-logo-full-1024.png';

export function absoluteUrl(path = '/') {
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`;
}

// og:title defaults to the page title plus the brand, matching the browser tab.
export function pageOpenGraph({ title, description, path, ogTitle }) {
  return {
    title: ogTitle || `${title} · ${SITE_NAME}`,
    description,
    url: absoluteUrl(path),
    siteName: SITE_NAME,
    type: 'website',
    images: [OG_IMAGE],
  };
}

export function webPageJsonLd({ title, description, path }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: absoluteUrl(path),
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };
}

export const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl(OG_IMAGE),
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: 'Reviewed Blogger publishing and downloadable manual Pinterest packs.',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};
