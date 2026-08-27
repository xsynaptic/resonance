// Minimum dimensions recommended by Facebook (1.91:1 aspect ratio)
export const OPEN_GRAPH_IMAGE_WIDTH = 1200;
export const OPEN_GRAPH_IMAGE_HEIGHT = 630;
export const OPEN_GRAPH_IMAGE_FORMAT = 'jpg';

// Path segment the cards are served under, on whichever origin OG_BASE_URL names
export const OPEN_GRAPH_BASE_PATH = 'og';

// Durable render cache, kept between builds and copied into the build output
export const OPEN_GRAPH_OUTPUT_PATH = './.cache/og-image';

// Freshness manifest, alongside the rendered cards
export const OPEN_GRAPH_MANIFEST_FILE = 'manifest.json';

// The card every page without one of its own falls back to
export const OPEN_GRAPH_DEFAULT_ID = 'index-default';

// Astro's cache directory, set explicitly so build scripts read the data store where Astro writes it
export const ASTRO_CACHE_DIR = './node_modules/.astro';

// The brand line on every OG card, and the site title; read by the app through `#lib/site.ts`
export const SITE_TITLE = 'DJ Basilisk';
