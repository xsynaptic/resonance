export const blogPageSize = 10;

export const contentCollectionsPath = './packages/content/collections';

// Emitted by <More />; a list view splits the rendered body on it
export const contentExcerptMarker = '<!--more-->';

// Pulled via `pnpm stats-pull`; may not exist locally
export const downloadsStatsPath = './packages/content/data/downloads.json';

// Every feed item is a full off-page MDX render, so the count is the build cost
export const feedItemCount = 20;

export const listPageSize = 24;

// Pulled via `pnpm mixcloud-stats` and committed, so a build never reaches Mixcloud
export const mixcloudStatsPath = './packages/content/data/mixcloud-stats.jsonl';

// Pulled via `pnpm soundcloud-stats` and committed, so a build never reaches SoundCloud
export const soundcloudStatsPath = './packages/content/data/soundcloud-stats.jsonl';
