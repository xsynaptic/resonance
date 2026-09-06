import type { APIRoute } from 'astro';

import { getEntry } from 'astro:content';
import { open } from 'node:fs/promises';
import path from 'node:path';

import { getMixAudio } from '#lib/collections/mixes/mixes-audio.ts';

// A prototype seam, not a delivery route: how the archives get served in production is still open
// Shaped the way the nginx block would be, so whatever the client learns against it transfers

// Not the scripts package's `waveformsCacheDir`: that workspace is not a dependency of the app
const archiveDir = './.cache/waveforms';

const headerBytes = 20;
const archiveVersion = 1;
const eightBitFlag = 1;

// Range needs the real request headers, which a prerendered route is not given
// eslint-disable-next-line unicorn/consistent-boolean-name -- Astro reads this export by name
export const prerender = false;

type ArchiveHandle = Awaited<ReturnType<typeof open>>;

interface ByteRange {
	end: number;
	start: number;
}

export const GET: APIRoute = async ({ params, request }) => {
	const handle = await openArchive(params.slug);
	if (!handle) return new Response('No archive', { status: 404 });

	try {
		const fault = await headerFault(handle);
		if (fault) return new Response(fault, { status: 500 });

		const { size } = await handle.stat();
		const range = parseRange(request.headers.get('range') ?? undefined, size);

		if (range === 'unsatisfiable') {
			return new Response(undefined, {
				headers: { 'Content-Range': `bytes */${String(size)}` },
				status: 416,
			});
		}

		return range ? await partial(handle, range, size) : await whole(handle, size);
	} finally {
		await handle.close();
	}
};

// Version 2 only appears with `--split-channels` and would silently halve every offset
async function headerFault(handle: ArchiveHandle): Promise<string | undefined> {
	const header = Buffer.alloc(headerBytes);
	const { bytesRead } = await handle.read(header, 0, headerBytes, 0);
	if (bytesRead < headerBytes) return 'Archive is shorter than its header';

	const version = header.readInt32LE(0);
	if (version !== archiveVersion) return `Archive is version ${String(version)}, expected 1`;

	const flags = header.readUInt32LE(4);

	return flags === eightBitFlag ? undefined : `Archive is not 8-bit (flags ${String(flags)})`;
}

// The manifest owns the archive's file name, the same way it owns the rendition's
async function openArchive(slug: string | undefined): Promise<ArchiveHandle | undefined> {
	if (slug === undefined) return undefined;

	const entry = await getEntry('mixes', slug);
	const audio = entry ? await getMixAudio(entry.data) : undefined;
	if (!audio) return undefined;

	try {
		return await open(path.resolve(archiveDir, `${audio.base}.dat`), 'r');
	} catch {
		return undefined;
	}
}

// The nginx block would answer far more of the spec; the loader only ever sends `bytes=a-b`
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

async function partial(
	handle: ArchiveHandle,
	{ end, start }: ByteRange,
	size: number,
): Promise<Response> {
	const body = Buffer.alloc(end - start + 1);

	await handle.read(body, 0, body.length, start);

	return new Response(body, {
		headers: {
			'Accept-Ranges': 'bytes',
			'Content-Length': String(body.length),
			'Content-Range': `bytes ${String(start)}-${String(end)}/${String(size)}`,
			'Content-Type': 'application/octet-stream',
		},
		status: 206,
	});
}

async function whole(handle: ArchiveHandle, size: number): Promise<Response> {
	return new Response(await handle.readFile(), {
		headers: {
			'Accept-Ranges': 'bytes',
			'Content-Length': String(size),
			'Content-Type': 'application/octet-stream',
		},
	});
}
