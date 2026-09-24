# Resonance

An Astro 7 port of [djbasilisk.com](https://djbasilisk.com), a DJ and electronic music site that used to run on WordPress.

It builds on [spectralcodex](https://github.com/xsynaptic/spectralcodex): when you're unsure how to structure something, copy the pattern from there. The `@xsynaptic/*` packages come from [astro-lab](https://github.com/xsynaptic/astro-lab) via npm.

Read `.claude/context.md` before naming anything or writing user-facing copy; its vocabulary is binding.

Add a line to this file only if it changes what an agent does.

## Documents under `.claude/`

Documents in `tasks/`, `tasks-backlog/`, `tasks-completed/` and `reference/` carry a `status` in frontmatter. Check it before treating anything in the body as work.

| `status`    | Means                                                  |
| ----------- | ------------------------------------------------------ |
| `ready`     | Open work, actionable now                              |
| `deferred`  | Real, but put off; the document says why               |
| `wontfix`   | Decided against                                        |
| `draft`     | A brief or spec, not yet decided                       |
| `done`      | Finished work, kept for its measurements and reasoning |
| `reference` | How something works now; not work                      |

**Only `ready` is live work.** Everything else has already been through Xander, so raising it again as a finding wastes a review cycle. If new evidence contradicts a decision, name the measurement that changed. Settled items inside a `ready` document are marked inline (**Deferred**, **Wontfix**, **Decided, do not re-raise**) and get the same treatment.

## Conventions

- Imports use the Node `#*` subpaths with an explicit extension (`#lib/site.ts`); extensionless ones don't resolve. Each package defines its own `#*` map, and every import within a package goes through it, sibling files included.
- Code that touches `window` or any other browser global goes under `src/components/**` or in a package; `src/lib/**` is build-time and server code. ESLint only allows browser globals in those paths, so browser code in `src/lib/**` passes `astro check` and then fails `pnpm check`.

## Styling

- Tailwind v4 for anything new, with utilities on the element. Drop to vanilla CSS when the Tailwind syntax gets arcane or the class isn't already in the main CSS output.
- A component stylesheet (`src/styles/main/components/<component>.css`, registered in `main.css` under `layer(components)`) holds only what can't sit on the element: markup authored elsewhere (MDX, pagefind, maplibre), structural and state selectors, pseudo-elements carrying `content`, and values with no theme step.
- A decoration used like a utility usually becomes an `@utility` in `parts/utilities.css`.
- Components carry no `<style>` blocks: they bundle into one file, sit outside the cascade layers, and only reach their own template. `main-stylesheet.astro` is the one `is:inline` exception, as a FOUC guard.
- A hook class carries only what the stylesheet targets. Its family shares a prefix naming the target, with a root name you can grep to find and replace the whole family. Stay clear of Microformat prefixes (`p-`, `h-`, `u-`, `dt-`, `e-`).
- Stylesheets read tokens with `var(--…)` and use `@apply` only to replace a media query or compose a project `@utility`. Stacking order comes from `--z-index-*`, as `z-*` utilities or `var()`.
- Every `hover:` on a focusable element gets a matching `focus-visible:`. In a stylesheet, `:hover` goes under `@media (hover: hover)` (as Tailwind's `hover:` does) and its `:focus-visible` partner stays outside it.

## Content

`packages/content` is a **separate private repository**, nested here and gitignored as a whole. Read `packages/content/AGENTS.md` before touching anything in it, and open it as its own project for longer content work so its rules load. Since it's ignored, `git clean -xdf` here deletes it, `.git` and all.

The collections were generated once from a WordPress dump and have been edited by hand since; nothing regenerates them. `.claude/reference/wordpress-origins.md` covers the migration archive.

- Schemas import `z` from `'zod'`; the `'astro:content'` export is deprecated in Astro 7.
- A component added to `autoImport()` in the Astro config also needs its props in `MDXProvidedComponents` (`packages/content/global.d.ts`).
- **Selections** live in a Post's or Page's `selections` frontmatter and render through the `<Selections>` MDX tag. A selection's `entryId` (a mix, review or post, by bare slug) fills every field the selection leaves unset, review body included, so a row can be one line; inline fields win.
- **Artists and labels are Credits** (`src/lib/schemas/credits.ts`), which work the other way round from every other vocabulary (those use Astro `reference()`): a bare string is free text that links only if its slug matches a cataloged term, and `{ id, name? }` must resolve but only `console.warn`s when it doesn't.

## Build and checks

`pnpm build` wraps `astro build` in the steps it needs; run alone, `astro build` renders every media image without its LQIP placeholder. The build doesn't type-check; `pnpm check` does.

The root `package.json` holds entry points only. Every script in `packages/scripts`, build steps included, runs on its own as `pnpm scripts <name>` (`pnpm scripts og-image --clear-cache`).

`pnpm check` and `pnpm fix` are the gate, defined in `lefthook.yml`. `check` is green end to end, so anything it reports is yours.

The two Playwright suites run on demand, outside `check`, and both need the content repository and `ffmpeg`:

- `pnpm test-e2e-player` tests the player in isolation across four browsers. Run it after changing anything under `packages/player/src/engine/`, `store/` or `page-controls.ts`.
- `pnpm test-e2e-smoke` tests the site against `dist/`, so build first. `deploy-site` runs it after its build (`--skip-smoke` opts out), and `pnpm test-e2e-smoke-prod` points it at the live site.
