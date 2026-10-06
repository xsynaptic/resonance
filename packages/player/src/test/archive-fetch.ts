import { vi } from 'vitest';

const chunkBytes = 8192 * 2;

export function chunkOf(sample: number): Promise<Response> {
	return Promise.resolve(new Response(new Int8Array(chunkBytes).fill(sample), { status: 206 }));
}

export function offline(): Promise<Response> {
	return Promise.reject(new TypeError('Failed to fetch'));
}

export function stubArchiveFetch(respond: () => Promise<Response>) {
	const fetchMock = vi.fn(respond);

	vi.stubGlobal('fetch', fetchMock);

	return { chunkRequests: () => fetchMock.mock.calls.length };
}
