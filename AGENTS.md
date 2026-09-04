# Resonance

An Astro 7 port of [djbasilisk.com](https://djbasilisk.com), a DJ and electronic music site migrated off WordPress.

Builds on [**spectralcodex**](https://github.com/xsynaptic/spectralcodex). When unsure how to structure something, copy the pattern from there rather than inventing a parallel one. See also: [astro-lab](https://github.com/xsynaptic/astro-lab) (the `@xsynaptic/*` toolkit, consumed from npm).

Project vocabulary (Entry, Mix, Tracklist, Release, Term, Catalog, Detail Page vs List Page, and the Controlled vs Open Vocabulary distinction) is defined in `.claude/context.md`. Read it before naming anything or writing user-facing copy.

Avoid adding anything to this file unless it is important and relevant.

## Conventions

- Imports use Node `#*` subpaths mapped to `./src/*`, and **must carry the explicit extension** (`#lib/site.ts`). Extensionless `#` imports do not resolve under this config.
- `src/components/menu/menu-navigation.ts` is a later, better-organized refactor of its spectralcodex original and is **ahead of it**. Do not re-copy that file from there.

## Styling

- Tailwind v4 provides the base and should be used when prototyping anything new but we prefer to avoid the more arcane and convoluted syntax where possible. If an atomic class isn't already in the main CSS output consider writing vanilla CSS.
- Utilities inline by default; a rule in `src/styles/main/components/<component>.css` (registered in `main.css` under `layer(components)`) only when the selector or value cannot sit on the element: content not authored here (MDX, pagefind, maplibre), structural and state selectors, pseudo-elements carrying `content`, values with no theme step.
- A decoration applied like a utility typically becomes a `@utility` in `parts/utilities.css`.
- No `<style>` blocks (they bundle into the same file, sit outside the cascade layers, and stop at the component's own template); `main-stylesheet.astro` is the one `is:inline` exception (FOUC guard).
- A hook class carries only what the stylesheet targets and shares a descriptive prefix or short-form representing the target. Avoid Microformat prefixes (`p-`, `h-`, `u-`, `dt-`, `e-`).
- **A class family's root name should stay greppable**, so it can be found and replaced without reading every hit.
- Stylesheets read tokens as `var(--…)`; `@apply` where it replaces a media query or composes a project `@utility`.
- Stacking order is `--z-index-*` applied as `z-*` utilities or `var()`.
- Every `hover:` on a focusable element has its `focus-visible:` twin where relevant. A stylesheet `:hover` sits under `@media (hover: hover)`, as Tailwind's `hover:` does; its `:focus-visible` partner stays outside it.

## Content

`packages/content/collections/` was **generated** by the WordPress extractor until handover on 2026-09-03; the tracked content repository is the record now. The extractor has since been deleted, archived to `backups/wp-extract-2026-09-03.zip`. Restoring and re-running it wipes the collection directories and re-emits, destroying real work rather than merely inconveniencing, so if the dump is ever run again it goes onto a branch and is merged by hand. See `.claude/reference/wordpress-origins.md`.

`packages/content` is a **separate private repository**, nested here and gitignored whole. Read `packages/content/AGENTS.md` before writing or editing anything under that directory, and open `packages/content` as its own project for sustained content work, so those rules load automatically. Because the directory is ignored here, `git clean -xdf` in this repo deletes it outright, its own `.git` included, so be careful.

- Content files must be **`.mdx`, never `.md`**. The Satteri auto-import plugin hard-guards on the extension and silently no-ops on `.md`, turning `<Link>` into inert raw HTML with no error.
- Drafts are `_`-prefixed and skipped by the `[^_]*` glob loader.
- Schemas import `z` from `'zod'`, **not** `'astro:content'` (deprecated in Astro 7).
- Dates are `z.date()` and go in **unquoted**: YAML parses `YYYY-MM-DD` and `YYYY-MM-DD HH:mm:ss` as UTC dates, but a time without seconds stays a string and fails the schema. Track timestamps (`"00:07:08"`) stay quoted for the same reason, in reverse.
- Adding a component to `autoImport()` in the Astro config file means adding its props to `MDXProvidedComponents` in `packages/content/global.d.ts` too. The imports are injected by a mdast plugin, so the MDX language server cannot see them; that declaration is the only thing type-checking `.mdx` bodies in the editor.
- Prose in `.mdx` is owned by mdxlint (`pnpm check-content` / `pnpm fix-content`), not prettier, which ignores `*.mdx`.

**Selections** (the curated-roundup Format) are a `selections` array in a Post's or Page's frontmatter, rendered by the `<Selections>` MDX tag in the body. Data lives in frontmatter, presentation on the tag. A selection's `entryId` names a mix, review, or post by bare slug and **fills in every field the selection itself leaves unset**, the review's own body included, so the workflow is review-first and a complete row can be one line. Inline fields always win. See `src/lib/collections/selections/selections-resolve.ts`.

**Artists and labels use a polymorphic ref** (`src/lib/schemas/refs.ts`): `{ id, name? }` links and the id must resolve; a bare `string` is free text, which `resolveRefs()` links opportunistically when its slugified name matches a cataloged term. This **inverts** the usual convention where a bare value is an id. Styles, regions, eras, formats and themes stay strict Astro `reference()`, where a bare slug links. Unresolved ids only `console.warn`, so they fail quietly.

## Quality gate

`pnpm check` and `pnpm fix` are the gate; `package.json` lists what each one runs. `check` is green end to end; anything it reports is yours. `pnpm install` syncs the lefthook `pre-push` hook, which runs `pnpm check` before every push.
