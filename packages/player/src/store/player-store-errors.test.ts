import type { StoreApi } from 'zustand/vanilla';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';
import type { StreamResolution } from '#types.ts';

import { configured, fake, release, resetEngine, withResolver } from '#test/player-store.ts';

const mediaSnapshot = { networkState: 2, positionSeconds: 0, readyState: 0 };

async function failIntoRetry(store: StoreApi<PlayerStore>): Promise<void> {
	store.getState().playTrack(release, 'a');
	await vi.waitFor(() => {
		expect(fake.engine.load).toHaveBeenCalledTimes(1);
	});

	fake.callbacks.current?.onError('network');
	await vi.waitFor(() => {
		expect(fake.engine.load).toHaveBeenCalledTimes(2);
	});
}

beforeEach(resetEngine);

describe('engine errors', () => {
	test('re-resolves once on a failure, then reports the second as an error', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ itemId }) => {
			resolved.push(itemId);
			return Promise.resolve({
				status: 'ok',
				url: `https://api.test/tracks/${itemId}/${String(resolved.length)}`,
			});
		});

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});

		fake.callbacks.current?.onError('network');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		expect(resolved).toStrictEqual(['a', 'a']);
		expect(store.getState().status).not.toBe('error');

		fake.callbacks.current?.onError('network');
		expect(store.getState().status).toBe('error');
		expect(store.getState().playbackError).toStrictEqual({ itemId: 'a', stage: 'network' });
	});

	test('re-resolves again after a failure that follows playback', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ itemId }) => {
			resolved.push(itemId);
			return Promise.resolve({
				status: 'ok',
				url: `https://api.test/tracks/${itemId}/${String(resolved.length)}`,
			});
		});

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});

		fake.callbacks.current?.onError('network');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});

		// Reaching playback closes the chain the one re-resolve was spent on
		fake.callbacks.current?.onStatus('playing');
		fake.callbacks.current?.onError('network');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(3);
		});
		expect(resolved).toStrictEqual(['a', 'a', 'a']);
		expect(store.getState().status).not.toBe('error');
	});

	test('stops at a capped resolve without loading or re-resolving', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ itemId }) => {
			resolved.push(itemId);
			return Promise.resolve({ status: 'capped' });
		});

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(store.getState().status).toBe('capped');
		});

		expect(fake.engine.load).not.toHaveBeenCalled();
		expect(resolved).toStrictEqual(['a']);
	});

	test('loads a type the probe declined, and plays it when the probe was wrong', async () => {
		const store = withResolver(({ itemId }) =>
			Promise.resolve({
				status: 'ok',
				type: 'audio/mp4; codecs="Opus"',
				url: `https://api.test/tracks/${itemId}/stream`,
			}),
		);
		fake.engine.canPlay.mockReturnValue(false);

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onStatus('playing');

		expect(fake.engine.canPlay).toHaveBeenCalledWith('audio/mp4; codecs="Opus"');
		expect(store.getState().status).toBe('playing');
	});

	test('an unsupported failure on a declined type is unplayable, without a re-resolve', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ itemId }) => {
			resolved.push(itemId);
			return Promise.resolve({
				status: 'ok',
				type: 'audio/x-unplayable',
				url: `https://api.test/tracks/${itemId}/stream`,
			});
		});
		fake.engine.canPlay.mockReturnValue(false);

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onError('unsupported');

		expect(store.getState().status).toBe('unplayable');
		expect(store.getState().isPaused).toBe(true);
		expect(resolved).toStrictEqual(['a']);
	});

	test('an unsupported failure on a type the probe accepted still earns its re-resolve', async () => {
		const store = withResolver(({ itemId }) =>
			Promise.resolve({
				status: 'ok',
				type: 'audio/mp4; codecs="Opus"',
				url: `https://api.test/tracks/${itemId}/stream`,
			}),
		);

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onError('unsupported');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		expect(store.getState().status).not.toBe('unplayable');
	});

	test('drops a resolve that lands after the listener moved on', async () => {
		const pending = new Map<string, (resolution: StreamResolution) => void>();
		const store = withResolver(
			({ itemId }) =>
				new Promise<StreamResolution>((resolve) => {
					pending.set(itemId, resolve);
				}),
		);

		store.getState().playTrack(release, 'a');
		store.getState().playTrack(release, 'b');

		// The abandoned track answers last, the order that would otherwise pull the queue back
		pending.get('b')?.({ status: 'ok', url: 'https://api.test/b' });
		pending.get('a')?.({ status: 'ok', url: 'https://api.test/a' });

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		expect(fake.engine.load).toHaveBeenCalledWith({
			resumeAtSeconds: 0,
			src: 'https://api.test/b',
		});
	});

	test('reloads a failed track where it stood when play is pressed again', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});

		fake.callbacks.current?.onError('network');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		fake.callbacks.current?.onTime(42);
		fake.callbacks.current?.onError('network');
		expect(store.getState().status).toBe('error');

		store.getState().togglePaused();
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(3);
		});
		expect(fake.engine.load).toHaveBeenLastCalledWith(
			expect.objectContaining({ resumeAtSeconds: 42 }),
		);
		expect(fake.engine.play).not.toHaveBeenCalled();
	});

	test('enters the error state when the resolve itself never answers', async () => {
		const store = withResolver(() => Promise.reject(new Error('no route')));

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(store.getState().status).toBe('error');
		});

		expect(fake.engine.load).not.toHaveBeenCalled();
	});
});

describe('diagnostics', () => {
	test('stamps each report with the loaded item and whether its attempt is the re-resolve', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onDiagnostic?.({
			...mediaSnapshot,
			kind: 'media-error',
			message: 'gone',
		});
		expect(store.getState().diagnostic).toMatchObject({ isRetry: false, itemId: 'a' });

		fake.callbacks.current?.onError('network');
		fake.callbacks.current?.onDiagnostic?.({
			...mediaSnapshot,
			bufferedAheadSeconds: 0,
			hasPlayed: false,
			kind: 'stall',
		});
		expect(store.getState().diagnostic).toMatchObject({
			isRetry: true,
			itemId: 'a',
			kind: 'stall',
		});
	});

	test('a re-resolve that reaches playback reports the failure it recovered from', async () => {
		const store = configured();

		await failIntoRetry(store);
		fake.callbacks.current?.onStatus('playing');

		expect(store.getState().diagnostic).toMatchObject({
			isRetry: true,
			kind: 'retry-recovered',
			stage: 'network',
		});

		// Playing again later is not a second recovery
		const recovered = store.getState().diagnostic;

		fake.callbacks.current?.onStatus('paused');
		fake.callbacks.current?.onStatus('playing');
		expect(store.getState().diagnostic).toBe(recovered);
	});

	test('a re-resolve that fails as well reports no recovery', async () => {
		const store = configured();

		await failIntoRetry(store);
		fake.callbacks.current?.onError('network');

		expect(store.getState().status).toBe('error');
		expect(store.getState().diagnostic).toBeUndefined();
	});
});
