# Resonance

An Astro 7 port of [djbasilisk.com](https://djbasilisk.com), a DJ and electronic music site migrated off WordPress.

Builds on [**spectralcodex**](https://github.com/xsynaptic/spectralcodex). When unsure how to structure something, copy the pattern from there rather than inventing a parallel one. See also: [astro-lab](https://github.com/xsynaptic/astro-lab) (the `@xsynaptic/*` toolkit, consumed from npm).

Project vocabulary is binding and defined in `.claude/context.md`. Read it before naming anything or writing user-facing copy.

A line earns its place in this file by changing what an agent does.

## Documents under `.claude/`

Every document under `tasks/`, `tasks-backlog/`, `tasks-completed/` and `reference/` carries a `status` in frontmatter. Read it before treating anything in the body as work:

| `status`    | Means                                                              |
| ----------- | ------------------------------------------------------------------ |
| `ready`     | Open work, actionable now                                          |
| `deferred`  | Real, and decided against doing now; the reason is in the document |
| `wontfix`   | Decided against outright                                           |
| `draft`     | A brief or spec, not yet decided                                   |
| `done`      | A record of finished work, kept for its measurements and reasoning |
| `reference` | A map of how something is, not work                                |

**Only `ready` is live work.** An item under any other status has already been through Xander, so reporting it back as a finding costs a review cycle and returns nothing. If evidence contradicts a decision, say which measurement changed rather than re-raising the item.

A `ready` document can still hold settled items. Those carry their disposition inline, as **Deferred**, **Wontfix** or **Decided, do not re-raise**, and the same rule applies to them.

## Conventions

- Imports use Node `#*` subpaths and **must carry the explicit extension** (`#lib/site.ts`). Extensionless `#` imports do not resolve under this config. The `#*` imports map is per package and does not cascade; every package defines its own. A relative import inside a package is a mistake, including for a sibling file. The root package adds a second pattern, `#worker/*`, because `worker/` sits outside `src/`.

## Styling

- Tailwind v4 is the base for anything new. Where its syntax turns arcane, or the class is not already in the main CSS output, write vanilla CSS.
- Utilities inline by default. A rule in `src/styles/main/components/<component>.css` (registered in `main.css` under `layer(components)`) is for what cannot sit on the element: content not authored here (MDX, pagefind, maplibre), structural and state selectors, pseudo-elements carrying `content`, values with no theme step.
- A decoration applied like a utility typically becomes a `@utility` in `parts/utilities.css`.
- No `<style>` blocks (they bundle into the same file, sit outside the cascade layers, and stop at the component's own template); `main-stylesheet.astro` is the one `is:inline` exception (FOUC guard).
- A hook class carries only what the stylesheet targets and shares a descriptive prefix or short-form representing the target. Avoid Microformat prefixes (`p-`, `h-`, `u-`, `dt-`, `e-`).
- **A class family's root name should stay greppable**, so it can be found and replaced without reading every hit.
- Stylesheets read tokens as `var(--…)`; `@apply` where it replaces a media query or composes a project `@utility`.
- Stacking order is `--z-index-*` applied as `z-*` utilities or `var()`.
- Every `hover:` on a focusable element has its `focus-visible:` twin. A stylesheet `:hover` sits under `@media (hover: hover)`, as Tailwind's `hover:` does; its `:focus-visible` partner stays outside it.

## Content

`packages/content` is a **separate private repository**, nested here and gitignored whole. Read `packages/content/AGENTS.md` before creating or editing anything under it, and open it as its own project for sustained content work so those rules load automatically. Because the directory is ignored here, `git clean -xdf` in this repo deletes it outright, its own `.git` included.

The extractor that generated the collections is archived in `backups/wp-extract-2026-09-03.zip`. Re-running it wipes the collection directories and re-emits, so if the dump is ever run again it goes onto a branch and is merged by hand. See `.claude/reference/wordpress-origins.md`.

- Drafts are `_`-prefixed and skipped by the `[^_]*` glob loader, so they never enter the data store.
- Schemas import `z` from `'zod'`, **not** `'astro:content'` (deprecated in Astro 7).
- Adding a component to `autoImport()` in the Astro config means adding its props to `MDXProvidedComponents` in `packages/content/global.d.ts` too.

**Selections** (the curated-roundup Format) are a `selections` array in a Post's or Page's frontmatter, rendered by the `<Selections>` MDX tag: data in frontmatter, presentation on the tag. A selection's `entryId` names a mix, review, or post by bare slug and fills in every field the selection leaves unset, the review's body included, so a complete row can be one line and inline fields always win. See `src/lib/collections/selections/selections-resolve.ts`.

**Artists and labels use a polymorphic ref** (`src/lib/schemas/refs.ts`), inverting the usual convention: `{ id, name? }` links and the id must resolve, while a bare `string` is free text that `resolveRefs()` links opportunistically when its slugified name matches a cataloged term. Styles, regions, eras, formats and themes stay strict Astro `reference()`. Unresolved ids only `console.warn`, so they fail quietly.

## Build

`pnpm build` is a pipeline, not a synonym for `astro build`: LQIP placeholders (incrementally cached in `.cache/media-lqip.json`), `astro check`, redirects, sitemap lastmod, the build, then OG images. Calling `astro build` directly skips all of it, and every media image renders without its placeholder.

## Quality gate

`pnpm check` and `pnpm fix` are the gate; `package.json` lists what each one runs. `check` is green end to end; anything it reports is yours. `pnpm install` syncs the lefthook `pre-push` hook, which runs `pnpm check` before every push.
