import { createLocalFileRoute } from '#dev/audio/file-route.ts';
import { getIndex } from '#lib/collections/mixes/mixes-audio.ts';

// Range needs the real request headers, which a prerendered route is not given
// eslint-disable-next-line unicorn/consistent-boolean-name -- Astro reads this export by name
export const prerender = false;

export const GET = createLocalFileRoute({
	contentType: 'audio/webm; codecs="opus"',
	directory: './packages/content/streams',
	names: async () => {
		const index = await getIndex();

		return index.streams;
	},
});
