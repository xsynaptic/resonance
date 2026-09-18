import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AudioEngineCallbacks } from '#engine/audio-engine.ts';

import { createAudioEngine } from '#engine/audio-engine.ts';

const request = { resumeAtSeconds: 0, src: 'https://api.test/a' };

let isPaused = false;
let media: ReturnType<typeof spyOnMedia>;

function createCallbacks(): AudioEngineCallbacks {
	return {
		isPaused: () => isPaused,
		onDuration: vi.fn(),
		onEnded: vi.fn(),
		onError: vi.fn(),
		onStatus: vi.fn(),
		onTime: vi.fn(),
	};
}

function spyOnMedia() {
	return {
		load: vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(vi.fn()),
		pause: vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(vi.fn()),
		play: vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(),
	};
}

beforeEach(() => {
	isPaused = false;
	media = spyOnMedia();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('audio engine', () => {
	// The browser rejects the pending promise itself when a pause lands on it
	test('a pause during the element play leaves it paused and reports no failure', async () => {
		const callbacks = createCallbacks();
		const pendingPlay = Promise.withResolvers<undefined>();

		media.play.mockReturnValue(pendingPlay.promise);
		media.pause.mockImplementation(() => {
			pendingPlay.reject(new DOMException('Interrupted by a call to pause()', 'AbortError'));
		});

		const engine = createAudioEngine(callbacks);
		const loaded = engine.load(request);

		await vi.waitFor(() => {
			expect(media.play).toHaveBeenCalledOnce();
		});

		isPaused = true;
		engine.pause();
		await loaded;

		expect(callbacks.onError).not.toHaveBeenCalled();
		expect(media.play).toHaveBeenCalledOnce();
		expect(media.pause.mock.invocationCallOrder[0]).toBeGreaterThan(
			media.play.mock.invocationCallOrder[0] ?? Infinity,
		);
	});

	test('the pause a reset causes goes unreported, and a later one is reported', () => {
		vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);

		const callbacks = createCallbacks();
		const engine = createAudioEngine(callbacks);

		engine.reset();

		const [element] = media.pause.mock.contexts as Array<HTMLMediaElement>;

		element?.dispatchEvent(new Event('pause'));
		expect(callbacks.onStatus).not.toHaveBeenCalled();

		element?.dispatchEvent(new Event('pause'));
		expect(callbacks.onStatus).toHaveBeenCalledWith('paused');
	});

	// Loading resets the element's clock to zero, which is not where the load is headed
	test('holds the clock back while a resume offset waits on metadata', () => {
		const callbacks = createCallbacks();

		void createAudioEngine(callbacks).load({ ...request, resumeAtSeconds: 600 });

		const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

		element?.dispatchEvent(new Event('timeupdate'));
		expect(callbacks.onTime).not.toHaveBeenCalled();

		element?.dispatchEvent(new Event('loadedmetadata'));
		element?.dispatchEvent(new Event('timeupdate'));
		expect(callbacks.onTime).toHaveBeenCalled();
	});

	test('unloading drops the source so the old track stops downloading', () => {
		const engine = createAudioEngine(createCallbacks());

		void engine.load(request);
		engine.reset();

		const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

		expect(element?.hasAttribute('src')).toBe(false);
		expect(media.pause).toHaveBeenCalled();
	});
});
