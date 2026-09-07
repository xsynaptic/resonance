import type { APIRoute } from 'astro';

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

// Serves one of the player's audio files from disk, with the byte ranges both it and the panel need

interface ByteRange {
	end: number;
	start: number;
}

interface LocalFileRoute {
	contentType: string;
	directory: string;
	// The manifest is the allowlist, so a traversal attempt can never name a file this will open
	names: () => Promise<Set<string>>;
}

export function createLocalFileRoute({ contentType, directory, names }: LocalFileRoute): APIRoute {
	return async ({ params, request }) => {
		const file = params.file;
		if (file === undefined) return new Response('Not found', { status: 404 });

		const allowed = await names();
		if (!allowed.has(file)) return new Response('Not found', { status: 404 });

		const filePath = path.resolve(directory, file);
		const { size } = await stat(filePath);
		const range = parseRange(request.headers.get('range') ?? undefined, size);

		if (range === 'unsatisfiable') {
			return new Response(undefined, {
				headers: { 'Content-Range': `bytes */${String(size)}` },
				status: 416,
			});
		}

		// Streamed rather than buffered: a rendition without a Range header is the whole 100 MB
		if (!range) {
			return new Response(read(filePath, { end: size - 1, start: 0 }), {
				headers: {
					'Accept-Ranges': 'bytes',
					'Content-Length': String(size),
					'Content-Type': contentType,
				},
			});
		}

		return new Response(read(filePath, range), {
			headers: {
				'Accept-Ranges': 'bytes',
				'Content-Length': String(range.end - range.start + 1),
				'Content-Range': `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`,
				'Content-Type': contentType,
			},
			status: 206,
		});
	};
}

// Only the two forms a player sends; nginx answers the rest of the spec in production
function parseRange(
	header: string | undefined,
	size: number,
): 'unsatisfiable' | ByteRange | undefined {
	const match = header === undefined ? undefined : /^bytes=(\d+)-(\d*)$/.exec(header.trim());
	if (!match) return undefined;

	const start = Number(match[1]);
	const end = match[2] === '' || match[2] === undefined ? size - 1 : Number(match[2]);

	if (start >= size) return 'unsatisfiable';

	return { end: Math.min(end, size - 1), start };
}

// Node's ReadableStream type and the DOM's never unify, but the runtime object is what Response wants
function read(filePath: string, { end, start }: ByteRange): ReadableStream {
	return Readable.toWeb(createReadStream(filePath, { end, start })) as ReadableStream;
}
