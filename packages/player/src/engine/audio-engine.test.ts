import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AudioEngineCallbacks } from '#engine/audio-engine.ts';

const graphMock = vi.hoisted(() => ({ resume: vi.fn() }));

vi.mock('#engine/audio-graph.ts', () => ({
	createAudioGraph: () => ({
		analyser: vi.fn(),
		ensure: vi.fn(),
		outputDelay: () => 0,
		resume: graphMock.resume,
		setGain: vi.fn(),
		setVolume: vi.fn(),
	}),
}));

import { createAudioEngine } from '#engine/audio-engine.ts';

const request = { gain: 1, resumeAtSeconds: 0, src: 'https://api.test/a' };

let isPlayIntended = true;
let resume = Promise.withResolvers<boolean>();
let media: ReturnType<typeof spyOnMedia>;

function createCallbacks(): AudioEngineCallbacks {
	return {
		isPlayIntended: () => isPlayIntended,
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
	isPlayIntended = true;
	resume = Promise.withResolvers<boolean>();
	graphMock.resume.mockImplementation(() => resume.promise);
	media = spyOnMedia();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('audio engine', () => {
	test('plays once the graph resumes while playback is still intended', async () => {
		const loaded = createAudioEngine(createCallbacks()).load(request);

		resume.resolve(true);
		await loaded;

		expect(media.play).toHaveBeenCalledOnce();
	});

	test('a pause while the graph resumes leaves the element paused', async () => {
		const loaded = createAudioEngine(createCallbacks()).load(request);

		isPlayIntended = false;
		resume.resolve(true);
		await loaded;

		expect(media.play).not.toHaveBeenCalled();
	});

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

		resume.resolve(true);
		await vi.waitFor(() => {
			expect(media.play).toHaveBeenCalledOnce();
		});

		isPlayIntended = false;
		engine.pause();
		await loaded;

		expect(callbacks.onError).not.toHaveBeenCalled();
		expect(media.play).toHaveBeenCalledOnce();
		expect(media.pause.mock.invocationCallOrder[0]).toBeGreaterThan(
			media.play.mock.invocationCallOrder[0] ?? Infinity,
		);
	});

	test('a play still waiting on the graph when the track is reset never starts', async () => {
		const engine = createAudioEngine(createCallbacks());
		const loaded = engine.load(request);

		engine.reset();
		resume.resolve(true);
		await loaded;

		expect(media.play).not.toHaveBeenCalled();
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
