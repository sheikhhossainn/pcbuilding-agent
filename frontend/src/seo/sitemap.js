import { ALL_PAGES, LAST_MODIFIED, absoluteUrl } from './pages.js';

export const VALID_CHANGEFREQS = new Set([
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
]);

/**
 * Builds an XML sitemap complying with the sitemaps.org 0.9 protocol.
 *
 * @param {Array<{path: string}>} [pages=ALL_PAGES] List of pages to include
 * @param {string} [lastModified=LAST_MODIFIED] W3C date string (YYYY-MM-DD)
 * @returns {string} XML string
 */
export function generateSitemapXml(pages = ALL_PAGES, lastModified = LAST_MODIFIED) {
  const urls = pages.map((p) => {
    const isHome = p.path === '/';
    const changefreq = isHome ? 'weekly' : 'monthly';
    const priority = isHome ? '1.0' : '0.8';

    return [
      '  <url>',
      `    <loc>${absoluteUrl(p.path)}</loc>`,
      `    <lastmod>${lastModified}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
