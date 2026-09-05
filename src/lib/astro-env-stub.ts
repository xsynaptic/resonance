// Stands in for `astro:env/server`, which has no module outside the Astro build; wired in by the vitest alias

export const FILES_URL = 'https://files.example.com/';

// eslint-disable-next-line unicorn/consistent-boolean-name -- the name mirrors the astro:env variable it stands in for
export const PLAYER_ENABLED = false;
