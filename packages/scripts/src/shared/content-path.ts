// Mirrors the `CONTENT_DATA_PATH` default in astro.config.ts; the scripts read it from the environment directly
export const contentDataPath = process.env.CONTENT_DATA_PATH ?? 'packages/content';
