import type { APIRoute } from 'astro';

import { getThreadRegistry } from '#lib/comments/comments-registry.ts';

export const GET = (async () => Response.json(await getThreadRegistry())) satisfies APIRoute;
