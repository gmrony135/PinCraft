import { SITE_URL } from '@/lib/seo.mjs';
import { STUDIO_TOOLS } from '@/lib/studio-tools.mjs';

// Public, indexable pages only. Signed-in app pages (/article-writer, /library,
// /publish, /dashboard, /jobs) are noindex and intentionally excluded.
const PUBLIC_PATHS = [
  '/',
  '/about',
  '/pin-generator',
  '/content-studio',
  ...STUDIO_TOOLS.map(tool => tool.href),
  '/trend-finder',
  '/how-to-work',
  '/contact',
  '/privacy',
  '/terms',
];

export default function sitemap() {
  return PUBLIC_PATHS.map(path => ({
    url: path === '/' ? SITE_URL : `${SITE_URL}${path}`,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.6,
  }));
}
