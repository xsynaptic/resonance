// Minimum dimensions recommended by Facebook (1.91:1 aspect ratio)
export const openGraphImageWidth = 1200;
export const openGraphImageHeight = 630;
export const openGraphImageFormat = 'jpg';

// Path segment the cards are served under, on whichever origin OG_BASE_URL names
export const openGraphBasePath = 'og';

// The image pipeline's cache; its `cards/` is copied into the build output
export const imageCachePath = './.cache/images';

// The card every page without one of its own falls back to
export const openGraphDefaultId = 'index-default';

// Platforms cache a card by URL forever; renaming this is what makes them refetch
export const openGraphHomeId = 'homepage';

// Resolved against the content package's `media/`, like a Featured Image in frontmatter
export const openGraphHomeImageId = '2019/synaptic-fx-round-1.jpg';

export const sitemapLastmodPath = './.cache/sitemap-lastmod.json';

// The brand line on every OG card, and the site title; read by the app through `#lib/site.ts`
export const siteTitle = 'DJ Basilisk';

// Kept off `site.description`, which four other consumers read as an SEO string
export const siteTagline = 'Mixcraft, reviews, and writing on electronic music since 2001';

export const sqliteCachePath = './.cache';

// Peak Archives, Bands and Overviews, regenerable from the audio sources
export const waveformsCacheDir = './.cache/waveforms';

// Streaming metadata and waveforms, relative to the content package
export const mixAudioPath = 'data/mix-audio.json';
