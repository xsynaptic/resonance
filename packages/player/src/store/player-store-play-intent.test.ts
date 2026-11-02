import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
	configured,
	fake,
	pendingResolver,
	release,
	resetEngine,
	withResolver,
} from '#test/player-store.ts';

beforeEach(resetEngine);

describe('play intent', () => {
	test('a pause while the stream resolves hands the engine its source without playing it', async () => {
		const { answer, store } = pendingResolver();

		store.getState().playTrack(release, 'a');
		expect(store.getState().isPaused).toBe(false);

		store.getState().pause();
		answer('a');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith(
				expect.objectContaining({ src: 'https://api.test/a' }),
			);
		});
		expect(fake.engine.play).not.toHaveBeenCalled();
		expect(store.getState().status).toBe('paused');
		expect(store.getState().isPaused).toBe(true);
	});

	test('a press during a load cancels it, and a second press plays once the source lands', async () => {
		const { answer, store } = pendingResolver();

		store.getState().playTrack(release, 'a');
		store.getState().togglePaused();

		expect(fake.engine.pause).toHaveBeenCalledOnce();
		expect(store.getState().isPaused).toBe(true);

		store.getState().togglePaused();
		answer('a');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledOnce();
		});
		expect(store.getState().isPaused).toBe(false);
	});

	test('a seek while the stream resolves carries into the load', async () => {
		const { answer, store } = pendingResolver();

		store.getState().loadQueue(release);
		store.setState({ currentIndex: 1, currentTimeSeconds: 600 });
		store.getState().togglePaused();
		store.getState().seek(100);
		answer('b');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith(
				expect.objectContaining({ resumeAtSeconds: 100 }),
			);
		});
	});

	test('switching tracks silences the old one before the next resolves', async () => {
		const { answer, store } = pendingResolver();

		store.getState().playTrack(release, 'a');
		answer('a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onStatus('playing');

		store.getState().playTrack(release, 'b');

		expect(fake.engine.reset).toHaveBeenCalledOnce();
		expect(fake.engine.load).toHaveBeenCalledTimes(1);
		expect(store.getState().status).toBe('loading');
	});

	test('a pause from outside during a stall lets the lock screen resume in one press', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledOnce();
		});
		fake.callbacks.current?.onStatus('playing');
		fake.callbacks.current?.onStatus('loading');
		fake.callbacks.current?.onStatus('paused');

		expect(store.getState().status).toBe('paused');
		expect(store.getState().isPaused).toBe(true);

		store.getState().play();

		expect(fake.engine.play).toHaveBeenCalledOnce();
		expect(store.getState().isPaused).toBe(false);
	});

	test('play never pauses a load already on its way', () => {
		const { store } = pendingResolver();

		store.getState().playTrack(release, 'a');
		store.getState().play();

		expect(fake.engine.pause).not.toHaveBeenCalled();
		expect(store.getState().isPaused).toBe(false);
	});

	test('a failure long into playback retries where playback stood', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onStatus('playing');
		fake.callbacks.current?.onTime(600);
		fake.callbacks.current?.onError('network');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		expect(fake.engine.load).toHaveBeenLastCalledWith(
			expect.objectContaining({ resumeAtSeconds: 600 }),
		);
	});

	test('a failure while paused retries without starting playback', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onStatus('playing');
		store.getState().pause();
		fake.callbacks.current?.onError('network');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		expect(store.getState().isPaused).toBe(true);
		expect(store.getState().status).toBe('paused');
	});

	test.each([
		['capped', { status: 'capped' }],
		['unplayable', { status: 'ok', type: 'audio/x-unplayable', url: 'https://api.test/a' }],
	] as const)(
		'a press on a %s track re-resolves rather than playing what the engine holds',
		async (status, resolution) => {
			const resolved: Array<string> = [];
			const store = withResolver(({ itemId }) => {
				resolved.push(itemId);
				return Promise.resolve(resolution);
			});
			fake.engine.canPlay.mockReturnValue(false);
			fake.engine.load.mockImplementation(() => {
				fake.callbacks.current?.onError('unsupported');
				return Promise.resolve();
			});

			store.getState().playTrack(release, 'a');
			await vi.waitFor(() => {
				expect(store.getState().status).toBe(status);
			});
			expect(store.getState().isPaused).toBe(true);

			store.getState().togglePaused();

			await vi.waitFor(() => {
				expect(resolved).toHaveLength(2);
			});
			expect(fake.engine.play).not.toHaveBeenCalled();
		},
	);
});
