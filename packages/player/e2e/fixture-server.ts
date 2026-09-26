import type { IncomingMessage, ServerResponse } from 'node:http';

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { fixturePort } from '#e2e/constants.ts';

interface LoggedRequest {
	path: string;
	range: string | undefined;
	status: number;
}

const fixturesDirectory = path.join(import.meta.dirname, '.fixtures');

// As nginx serves the renditions, lowercase included
const contentTypes: Record<string, string> = {
	'.mp4': 'audio/mp4; codecs="opus"',
	'.png': 'image/png',
};

const garbage = randomBytes(256 * 1024);

// Per page run, so parallel tests read only their own requests
const requestLog = new Map<string, Array<LoggedRequest>>();
const flakyRuns = new Set<string>();
const stalledRuns = new Set<string>();

function contentType(name: string): string {
	return contentTypes[path.extname(name)] ?? 'application/octet-stream';
}

function logRequest(run: string, entry: LoggedRequest): void {
	const entries = requestLog.get(run) ?? [];

	entries.push(entry);
	requestLog.set(run, entries);
}

// One range from a start, the only shape a media element asks for; `undefined` is unsatisfiable
function parseRange(header: string, size: number): undefined | { end: number; start: number } {
	const match = /^bytes=(\d+)-(\d*)$/.exec(header);
	if (!match) return undefined;

	const [, startText = '', endText = ''] = match;
	const start = Number(startText);
	const end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);

	return start > end ? undefined : { end, start };
}

// Resolves to `undefined` for a request that is never answered
async function respond(
	request: IncomingMessage,
	response: ServerResponse,
	url: URL,
): Promise<number | undefined> {
	const [, behaviour, name = ''] = url.pathname.split('/', 3);
	const run = url.searchParams.get('run') ?? '';

	switch (behaviour) {
		case 'audio': {
			return sendFile(request, response, name);
		}
		case 'flaky': {
			if (flakyRuns.has(`${run}/${name}`)) return sendFile(request, response, name);

			flakyRuns.add(`${run}/${name}`);
			response.writeHead(404).end();
			return 404;
		}
		case 'garbage': {
			return sendBody(request, response, { body: garbage, type: contentType(name) });
		}
		case 'hang': {
			return undefined;
		}
		case 'log': {
			response
				.writeHead(200, { 'content-type': 'application/json' })
				.end(JSON.stringify(requestLog.get(run) ?? []));
			return 200;
		}
		case 'stalled': {
			if (stalledRuns.has(`${run}/${name}`)) return sendFile(request, response, name);

			stalledRuns.add(`${run}/${name}`);
			return undefined;
		}
		default: {
			response.writeHead(404).end();
			return 404;
		}
	}
}

function sendBody(
	request: IncomingMessage,
	response: ServerResponse,
	{ body, type }: { body: Buffer; type: string },
): number {
	response.setHeader('accept-ranges', 'bytes');
	response.setHeader('content-type', type);

	const header = request.headers.range;

	if (header === undefined) {
		response.writeHead(200, { 'content-length': body.length }).end(body);
		return 200;
	}

	const range = parseRange(header, body.length);

	if (range === undefined) {
		response.writeHead(416, { 'content-range': `bytes */${String(body.length)}` }).end();
		return 416;
	}

	response
		.writeHead(206, {
			'content-length': range.end - range.start + 1,
			'content-range': `bytes ${String(range.start)}-${String(range.end)}/${String(body.length)}`,
		})
		.end(body.subarray(range.start, range.end + 1));

	return 206;
}

async function sendFile(
	request: IncomingMessage,
	response: ServerResponse,
	name: string,
): Promise<number> {
	try {
		const body = await readFile(path.join(fixturesDirectory, path.basename(name)));

		return sendBody(request, response, { body, type: contentType(name) });
	} catch {
		response.writeHead(404).end();
		return 404;
	}
}

const server = createServer((request, response) => {
	const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
	const run = url.searchParams.get('run');

	response.setHeader('access-control-allow-origin', '*');

	void respond(request, response, url).then((status) => {
		if (run === null || url.pathname === '/log') return;

		logRequest(run, { path: url.pathname, range: request.headers.range, status: status ?? 0 });
	});
});

server.listen(fixturePort);
