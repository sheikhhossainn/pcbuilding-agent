/**
 * Retailers the engine can build from. Every site check in the backend reads this list, so
 * adding a store is one entry here (plus its scraper and the frontend's SITE_OPTIONS).
 *
 * `untracked`: categories that store's catalog does not carry. The engine gives them no budget
 * there and warns when the user asked for one.
 * `notice`: why a build at that store can't be completed right now. Shown when a build fails there.
 */
export const SITES = {
  startech: { label: 'StarTech BD' },
  techland: { label: 'TechLand BD' },
  computermania: {
    label: 'CompMania BD',
    untracked: ['Monitor', 'Mouse', 'Keyboard'],
    notice: 'CompMania BD only sells laptops and accessories right now, so it has no processors, motherboards or power supplies to build a PC from. Pick StarTech, TechLand or Ryans for a full build.',
  },
  ryans: { label: 'Ryans BD' },
};

export const VALID_SITES = Object.keys(SITES);

/** Display name for a site id ("ryans" -> "Ryans BD"); unknown ids come back unchanged. */
export const siteLabel = (site) => SITES[site]?.label || site;

/** False when the site's catalog does not carry the category. */
export const siteTracks = (site, category) => !(SITES[site]?.untracked || []).includes(category);

/** Why a build at the site can't be completed right now, or null. */
export const siteNotice = (site) => SITES[site]?.notice || null;

/** Categories the site does not carry, in the order listed above. */
export const untrackedCategories = (site) => [...(SITES[site]?.untracked || [])];
