import { vi } from 'vitest';

const headerRange = 'bytes=0-19';
const chunkBytes = 8192 * 2;

function header(): ArrayBuffer {
	const view = new DataView(new ArrayBuffer(20));

	view.setInt32(0, 1, true);
	view.setUint32(4, 1, true);
	view.setInt32(8, 44_100, true);
	view.setInt32(12, 441, true);
	view.setUint32(16, 20_000, true);

	return view.buffer;
}

function rangeOf(init: RequestInit | undefined): string | undefined {
	return (init?.headers as Record<string, string> | undefined)?.Range;
}

export function chunkOf(sample: number): Promise<Response> {
	return Promise.resolve(new Response(new Int8Array(chunkBytes).fill(sample), { status: 206 }));
}

export function offline(): Promise<Response> {
	return Promise.reject(new TypeError('Failed to fetch'));
}

export function stubArchiveFetch(respond: () => Promise<Response>) {
	const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
		rangeOf(init) === headerRange
			? Promise.resolve(new Response(header(), { status: 206 }))
			: respond(),
	);

	vi.stubGlobal('fetch', fetchMock);

	return {
		chunkRequests: () =>
			fetchMock.mock.calls.filter(([, init]) => rangeOf(init) !== headerRange).length,
	};
}
