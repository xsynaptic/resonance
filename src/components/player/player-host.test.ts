// @vitest-environment happy-dom
import type { PlayerStoreApi, PlayerUrls } from '@xsynaptic/plazmoid-core';
import type { ViewStoreApi } from '@xsynaptic/plazmoid-player';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { getPlayerLabels } from '#components/player/player-labels.ts';

const analytics = vi.hoisted(() => ({ trackControlPress: vi.fn(), trackPlayerEvent: vi.fn() }));
const stats = vi.hoisted(() => ({ bindPlayerStats: vi.fn() }));

vi.mock('#components/player/player-analytics.ts', () => analytics);
vi.mock('#components/player/player-stats.ts', () => stats);

import { configurePlayer } from '#components/player/player-host.ts';

const refreshQueue = vi.fn();
const store = { getState: () => ({ refreshQueue }) } as unknown as PlayerStoreApi;

const libraryEntry = {
	detail: { trackCount: 3 },
	press: {
		artistLine: 'Basilisk',
		releaseTitle: 'A',
		sources: [{ type: 'audio/mp4; codecs="Opus"', url: '/a.mp4' }],
		title: 'A',
		trackId: 'a',
	},
};

const host = document.createElement('div');

const hostData = {
	labels: getPlayerLabels(),
	libraryUrl: '/api/player/library.json?v=abc',
	seekSeconds: 30,
	stylesheetUrl: 'data:text/css,',
};

async function boot(): Promise<PlayerUrls> {
	const { load, urls } = configurePlayer(host, hostData);

	await load?.();

	return urls(store);
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe('configurePlayer', () => {
	test('the bar shows the scope and the seek step, presses and events are tracked, and stats bind once ready', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
		);

		const { load, player, seekSeconds, stylesheetUrl } = configurePlayer(host, hostData);
		const hooks = await load?.();

		hooks?.onReady?.({
			controls: { refresh: vi.fn(), unbind: vi.fn() },
			root: document.createElement('pzm-root'),
			store,
			view: {} as ViewStoreApi,
		});

		expect(player).toMatchObject({ isScopeEnabled: true });
		expect(seekSeconds).toBe(30);
		expect(stylesheetUrl).toBe('data:text/css,');
		expect(hooks?.onEvent).toBe(analytics.trackPlayerEvent);
		expect(hooks?.onPress).toBe(analytics.trackControlPress);
		expect(stats.bindPlayerStats).toHaveBeenCalledExactlyOnceWith(store);
	});

	test('a host with no script, or one of another shape, is refused before anything reads it', () => {
		const { libraryUrl: _libraryUrl, ...withoutLibrary } = hostData;

		expect(() => configurePlayer(host, undefined)).toThrow('no script of labels and options');
		expect(() => configurePlayer(host, withoutLibrary)).toThrow('no script of labels and options');
		expect(() => configurePlayer(host, { ...hostData, labels: 'Play' })).toThrow(
			'no script of labels and options',
		);
	});

	test('the Library refreshes the stored Queue with its press rows, and answers for detail', async () => {
		const fetchLibrary = vi.fn(() => Promise.resolve(Response.json([libraryEntry])));

		vi.stubGlobal('fetch', fetchLibrary);

		const urls = await boot();

		await vi.waitFor(() => {
			expect(refreshQueue).toHaveBeenCalledWith([libraryEntry.press]);
		});

		await expect(urls.detail?.(libraryEntry.press)).resolves.toStrictEqual(libraryEntry.detail);
		await expect(urls.detail?.({ ...libraryEntry.press, trackId: 'b' })).resolves.toBeUndefined();
		expect(fetchLibrary).toHaveBeenCalledExactlyOnceWith('/api/player/library.json?v=abc', {
			signal: expect.any(AbortSignal) as AbortSignal,
		});
		expect(refreshQueue).toHaveBeenCalledOnce();
	});

	test('a Library fetch that fails is made again by the next call, and a late success refreshes the Queue', async () => {
		const fetchLibrary = vi
			.fn<() => Promise<Response>>()
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockImplementation(() => Promise.resolve(Response.json([libraryEntry])));

		vi.stubGlobal('fetch', fetchLibrary);

		const urls = await boot();

		await settle();
		await expect(urls.detail?.(libraryEntry.press)).rejects.toThrow('Failed to fetch');
		expect(refreshQueue).not.toHaveBeenCalled();

		await expect(urls.detail?.(libraryEntry.press)).resolves.toStrictEqual(libraryEntry.detail);
		expect(fetchLibrary).toHaveBeenCalledTimes(3);
		expect(refreshQueue).toHaveBeenCalledExactlyOnceWith([libraryEntry.press]);
	});

	test('a Library fetch that never answers fails at the timeout, for every call waiting on it', async () => {
		const timeout = new AbortController();
		const timeoutSignal = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
		const fetchLibrary = vi.fn(
			(_url: string, { signal }: { signal: AbortSignal }) =>
				new Promise<Response>((_resolve, reject) => {
					signal.addEventListener('abort', () => {
						reject(new DOMException('The Library timed out', 'TimeoutError'));
					});
				}),
		);

		vi.stubGlobal('fetch', fetchLibrary);

		const urls = await boot();
		const answer = urls.detail?.(libraryEntry.press);

		timeout.abort();

		await expect(answer).rejects.toThrow('The Library timed out');
		expect(timeoutSignal).toHaveBeenCalledExactlyOnceWith(10_000);
		expect(fetchLibrary).toHaveBeenCalledOnce();

		timeoutSignal.mockRestore();
	});
});
