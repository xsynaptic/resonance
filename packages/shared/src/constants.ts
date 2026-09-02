// Minimum dimensions recommended by Facebook (1.91:1 aspect ratio)
export const openGraphImageWidth = 1200;
export const openGraphImageHeight = 630;
export const openGraphImageFormat = 'jpg';

// Path segment the cards are served under, on whichever origin OG_BASE_URL names
export const openGraphBasePath = 'og';

// Durable render cache, kept between builds and copied into the build output
export const openGraphOutputPath = './.cache/og-image';

// Freshness manifest, alongside the rendered cards
export const openGraphManifestFile = 'manifest.json';

// The card every page without one of its own falls back to
export const openGraphDefaultId = 'index-default';

// Astro's cache directory, set explicitly so build scripts read the data store where Astro writes it
export const astroCacheDir = './node_modules/.astro';

// The brand line on every OG card, and the site title; read by the app through `#lib/site.ts`
export const siteTitle = 'DJ Basilisk';
