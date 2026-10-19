/**
 * Product photos a browser can actually load.
 *
 * Some stores put their image host behind a bot challenge (Ryans: Cloudflare answers every
 * hotlinked image with a 403 challenge page), so their photos never render on our site. For those
 * parts we show the photo of the same product from a store whose images do load, and no photo
 * (the category icon) when no other store lists the same model. Only exact matches lend a photo:
 * an "equivalent" part can be a different brand and would show the wrong product.
 */

import { SITES, VALID_SITES } from '../config/sites.js';
import { compareParts } from './productIdentity.js';

const BLOCKED_HOSTS = Object.values(SITES).map((s) => s.blockedImageHost).filter(Boolean);
const DONOR_SITES = VALID_SITES.filter((site) => !SITES[site]?.blockedImageHost);

/** True when the URL points at an image host that refuses to serve browsers. */
export function isBlockedImage(url) {
  if (typeof url !== 'string' || !url) return false;
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

/**
 * Same parts, with every unloadable photo replaced by the same product's photo from another
 * store, or removed.
 * @param {Array<object|null>} parts - parts with { name, category, image }
 * @param {{ listInStock: (site: string, category: string) => Promise<object[]> }} repo
 * @returns {Promise<Array<object|null>>}
 */
export async function withViewableImages(parts, repo) {
  return Promise.all((parts || []).map(async (part) => {
    if (!part || !isBlockedImage(part.image)) return part;
    const image = await borrowedImage(part, repo);
    return { ...part, image };
  }));
}

async function borrowedImage(part, repo) {
  if (!part.category || !repo?.listInStock) return null;
  for (const site of DONOR_SITES) {
    let listings = [];
    try {
      listings = await repo.listInStock(site, part.category);
    } catch {
      continue;
    }
    for (const listing of listings || []) {
      if (listing.image && !isBlockedImage(listing.image) && compareParts(part.category, part, listing) === 'exact') {
        return listing.image;
      }
    }
  }
  return null;
}

/** A build object ({ category: part|null }) with viewable photos. */
export async function buildWithViewableImages(build, repo) {
  if (!build) return build;
  const entries = Object.entries(build);
  const parts = await withViewableImages(
    entries.map(([category, part]) => (part ? { category, ...part } : part)),
    repo,
  );
  return Object.fromEntries(entries.map(([category], i) => [category, parts[i]]));
}
