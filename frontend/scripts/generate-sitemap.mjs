import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ALL_PAGES, LAST_MODIFIED } from '../src/seo/pages.js';
import { generateSitemapXml } from '../src/seo/sitemap.js';

const baseDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(baseDir, 'public');
const distDir = path.join(baseDir, 'dist');

const sitemap = generateSitemapXml(ALL_PAGES, LAST_MODIFIED);

// 1. Write to public/ so it's always in source control & available in dev mode
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap, 'utf8');
console.log(`[sitemap] Wrote ${ALL_PAGES.length} URLs to public/sitemap.xml`);

// 2. Write to dist/ if build directory exists
if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap, 'utf8');
  console.log(`[sitemap] Wrote ${ALL_PAGES.length} URLs to dist/sitemap.xml`);
}
