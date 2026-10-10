import { vi } from 'vitest';

const chunkBytes = 8192 * 2;

export function chunkOf(sample: number): Promise<Response> {
	return Promise.resolve(new Response(new Int8Array(chunkBytes).fill(sample), { status: 206 }));
}

export function offline(): Promise<Response> {
	return Promise.reject(new TypeError('Failed to fetch'));
}

export function stubArchiveFetch(respond: (url: string) => Promise<Response>) {
	const fetchMock = vi.fn((url: string, _init?: RequestInit) => respond(url));

	vi.stubGlobal('fetch', fetchMock);

	return {
		chunkRequests: () => fetchMock.mock.calls.length,
		rangeRequests: () =>
			fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('Range')),
		urls: () => fetchMock.mock.calls.map(([url]) => url),
	};
}
