# Resonance

This repository contains the working [Astro](https://astro.build) project used to generate [djbasilisk.com](https://djbasilisk.com), home to two decades of DJ mixes, music reviews, and writing about electronic music. It replaces a long-running WordPress install with a static site built around a custom audio player.

Resonance is a sibling of [Spectral Codex](https://github.com/xsynaptic/spectralcodex) and shares much of its foundation, including the [Astro Lab](https://github.com/xsynaptic/astro-lab) toolkit extracted from both. Where Spectral Codex is about places and images, this one is about sound.

## Features

### Audio Player

The centrepiece of the site. Mixes run anywhere from one to eight hours, so the player is built for long-form listening rather than a track dropped into an embed.

- Written from scratch as native web components over a `zustand/vanilla` store, with no framework; heavier parts (the overlay, the queue tray, the waveform panel) lazy load on first use
- Survives page navigation via Astro's `<ClientRouter />`, so the music keeps playing while you browse
- A queue visitors can add to and reorder, restored per browser after a reload without autoplaying
- Curated Playlists on the homepage: pick a style, lean back, and the next mix picks up when one ends
- Cue points derived from each mix's timestamped tracklist drive track skipping, now-playing titles, and the Media Session API for lock screens and hardware keys
- A scrolling waveform panel drawn to Canvas 2D from full-resolution waveform archives, fetching only the window on screen via HTTP range requests
- Sub-pixel scrolling driven by a first-order tracking clock rather than the media element's stepped `currentTime`, so the waveform glides instead of stuttering

### Audio Pipeline

- Lossless masters in, 128kbps Opus in MP4 out; the codec was chosen on measured size, encode time, and bytes before first audio, and the bitrate was settled by a blind listening test
- Every rendition is loudness corrected per file to decode at or under −1 dBTP, with the gain baked into the file
- Waveforms generated with [audiowaveform](https://github.com/bbc/audiowaveform): a full-resolution archive for the panel, plus a 400-bucket preview inlined into each page
- Previews reduced by RMS rather than peak, since a peak envelope of a mastered mix is a featureless rectangle
- MP3 and FLAC downloads, many with a generated `.cue` sheet

### Listening Stats

- Listens counted on the site itself, where a Listen means at least 30 seconds of audio actually advanced; heard time is reported by a small [playback stats package](./packages/playback-stats) and stored in Cloudflare D1
- Download counts aggregated from file server logs, with the historical figures reconstructed from years of rescued logs under corrected counting rules
- Mixcloud and SoundCloud play counts pulled from their APIs into append-only snapshots tracked alongside the content

### Content Management

- All content authored in MDX using the Content Layer API, with strict Zod schemas
- Controlled vocabularies (Styles, Regions, Eras, Themes) are hierarchical and every reference must resolve
- Artists and Labels form an open vocabulary: a credit links only when it matches a cataloged name, so the thousands of names in tracklists don't each need a page
- Charts and selections authored as frontmatter data, where a single line can pull the title, artwork, and even the full review body from an existing entry
- Review tracklists sourced from Discogs by utility script
- Series: hand-curated reading orders that span collections
- A year-by-year archive across mixes, reviews, and posts
- Related content from a hand-rolled weighted scorer on [Hugo's model](https://gohugo.io/content-management/related-content/), pooled across collections and weighing shared credits, styles, and hand-authored links
- Content validation, redirect generation from former slugs, and linting via [mdxlint](https://github.com/remcohaszing/mdxlint)
- Content lives in its own private repository, nested into the workspace

### Comments

WordPress-parity comments on a fully static site, with no SSR adapter and no runtime read path.

- One hand-written Cloudflare Worker route handles writes into D1; every other request falls through to static assets
- Cheap local checks (size cap, honeypot, schema, minimum form age, entry and parent existence) all run before Cloudflare Turnstile
- Approved comments are pulled as a snapshot at deploy time and rendered statically into each page
- Works without JavaScript through a plain form post
- Legacy WordPress comments imported alongside new ones

### Migrated From WordPress

The original site ran a custom WordPress theme for well over a decade. A one-shot extractor spun up a throwaway MySQL from the database dump, reassembled the theme's repeater meta fields, and emitted MDX from the Markdown WordPress had stored all along. The generated tree was then handed over to version control and edited by hand from there.

- A full redirect map, so old WordPress URLs still land where they should
- The original upload tree preserved and served, including WordPress's resized derivatives, since those are what inbound links and image search point at
- Download counts and comments carried over from the old site

### Search & Discovery

- Client-side full-text search via [Pagefind](https://pagefind.app/) and the [astro-pagefind](https://github.com/shishkin/astro-pagefind) integration, with a modal interface via [@pagefind/component-ui](https://pagefind.app/docs/ui-usage/)
- Hierarchical navigation through styles, regions, eras, themes, and series
- Client-side fuzzy 404 suggestions via [@xsynaptic/path-suggestions](https://github.com/xsynaptic/astro-lab/tree/main/packages/path-suggestions) scored against a build-time content manifest

### SEO & Social

- Programmatic OG image generation via [Takumi](https://takumi.kane.tw) and Sharp, cached incrementally
- A JSON-LD `@graph` on every indexable page, with reviews described as `MusicAlbum` releases carrying their labels
- Sitemap with per-URL `lastmod` dates derived from git commit history
- Full RSS feed with server-side rendered MDX content via Astro's Container API

### Design & User Experience

- Tailwind v4 with colour ramps defined in OKLCH, reworked from the original WordPress palette
- Self-hosted fonts via Astro's fonts API
- Blurred WebP placeholders (LQIPs) generated incrementally at build time for every media image
- Self-hosted [Umami](https://umami.is/) analytics, with custom events fired from the player

## Build & Deployment

The site is static, served from Cloudflare Workers static assets, with one small Worker for comments and Listens. Audio is served from a separate nginx file server. A single TypeScript deploy script runs the whole pipeline:

1. Audio validation against frontmatter
2. Streaming renditions and waveform generation
3. Download, Mixcloud, and SoundCloud stats pulls
4. D1 backup and comment snapshot
5. The full quality gate (ESLint, Stylelint, Prettier, types, knip, fallow, Vitest, `astro check`)
6. Redirects and sitemap `lastmod` generation
7. LQIP generation and the Astro production build
8. OG image generation
9. Audio upload, uploaded before the site so a new page never references a file still in transit
10. Site deploy to Cloudflare
11. Health checks: range probes of every uploaded file, plus a TLS certificate expiry warning

## License

This project is licensed under the [MIT License](./LICENSE). Feel free to use and adapt the code (but not the personal content specific to the project) for your own projects.
