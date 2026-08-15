# Resonance

An Astro project for [djbasilisk.com](https://djbasilisk.com), a personal DJ and electronic music site previously running on WordPress.

## Stack

- Astro 7, Tailwind v4 (CSS-first), TypeScript 6, Zod 4
- pnpm 11 workspace, Node 24
- Content via the Astro Content Layer API; content lives in `packages/content`
- Quality gates: stylelint, prettier, eslint, astro check, tsc, knip

## Commands

```sh
pnpm install
pnpm dev      # local dev server
pnpm check    # full quality gate (lint, format, types, dead code)
pnpm fix      # auto-fix where possible, then check
pnpm build    # type-check then build
```
