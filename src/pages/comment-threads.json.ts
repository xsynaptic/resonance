import type { APIRoute } from 'astro';

import { buildThreadRegistry } from '#lib/comments/comments-registry.ts';

export const GET = (async () => Response.json(await buildThreadRegistry())) satisfies APIRoute;
