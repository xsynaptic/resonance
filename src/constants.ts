export const blogPageSize = 10;

export const contentCollectionsPath = './packages/content/collections';

// Emitted by <More />; a list view splits the rendered body on it
export const contentExcerptMarker = '<!--more-->';

// Pulled via `pnpm stats-pull`; may not exist locally
export const downloadsStatsPath = './packages/content/downloads.json';

// Frozen pre-launch counts; hand-edited from here on
export const legacyDownloadsPath = './packages/content/data/legacy-downloads.yaml';

export const listPageSize = 24;

// Pulled via `pnpm mixcloud-stats` and committed, so a build never reaches Mixcloud
export const mixcloudStatsPath = './packages/content/mixcloud-stats.json';
