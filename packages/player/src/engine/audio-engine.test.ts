import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AudioEngineCallbacks } from '#engine/audio-engine.ts';

import { createAudioEngine } from '#engine/audio-engine.ts';

const request = { resumeAtSeconds: 0, src: 'https://api.test/a' };

let isPaused = false;
let media: ReturnType<typeof spyOnMedia>;

function createCallbacks(): AudioEngineCallbacks {
	return {
		isPaused: () => isPaused,
		onDiagnostic: vi.fn(),
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

		const engine = createAudioEngine(callbacks);
		const playing = engine.element;

		media.play.mockReturnValueOnce(pendingPlay.promise);
		media.pause.mockImplementation(function (this: HTMLMediaElement) {
			if (this !== playing) return;

			pendingPlay.reject(new DOMException('Interrupted by a call to pause()', 'AbortError'));
		});

		const loaded = engine.load(request);

		await vi.waitFor(() => {
			expect(media.play).toHaveBeenCalled();
		});

		isPaused = true;
		engine.pause();
		await loaded;

		expect(callbacks.onError).not.toHaveBeenCalled();
		expect(media.play.mock.contexts.filter((context) => context === playing)).toHaveLength(1);
		expect(media.pause.mock.contexts.at(-1)).toBe(playing);
	});

	test('an autoplay refusal reports a pause rather than a failure', async () => {
		const callbacks = createCallbacks();

		media.play.mockRejectedValue(new DOMException('Refused', 'NotAllowedError'));

		await createAudioEngine(callbacks).load(request);

		expect(callbacks.onError).not.toHaveBeenCalled();
		expect(callbacks.onStatus).toHaveBeenLastCalledWith('paused');
	});

	test('a failed source reports no play rejection', async () => {
		const callbacks = createCallbacks();

		media.play.mockRejectedValue(new DOMException('No supported source', 'NotSupportedError'));

		await createAudioEngine(callbacks).load(request);

		expect(callbacks.onDiagnostic).not.toHaveBeenCalled();
	});

	// A reset's own pause never arrives, since its `load()` drops the queued event
	test('the first pause after a reset of a playing element is reported', () => {
		vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);

		const callbacks = createCallbacks();
		const engine = createAudioEngine(callbacks);

		engine.reset();

		const [element] = media.pause.mock.contexts as Array<HTMLMediaElement>;

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

	test('a stream without a finite length reports no duration over the queue one', () => {
		const callbacks = createCallbacks();

		void createAudioEngine(callbacks).load(request);

		const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

		element?.dispatchEvent(new Event('loadedmetadata'));
		expect(callbacks.onDuration).not.toHaveBeenCalled();
	});

	describe('stall watchdog', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		test('reports a load that never plays once, however often it waits again', async () => {
			const callbacks = createCallbacks();

			await createAudioEngine(callbacks).load(request);

			const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

			vi.advanceTimersByTime(19_999);
			expect(callbacks.onDiagnostic).not.toHaveBeenCalled();

			vi.advanceTimersByTime(1);
			element?.dispatchEvent(new Event('waiting'));
			vi.advanceTimersByTime(40_000);

			expect(callbacks.onDiagnostic).toHaveBeenCalledOnce();
			expect(callbacks.onDiagnostic).toHaveBeenCalledWith(
				expect.objectContaining({ hasPlayed: false, kind: 'stall' }),
			);
		});

		test('stays quiet when playback starts first', async () => {
			const callbacks = createCallbacks();

			await createAudioEngine(callbacks).load(request);

			const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

			vi.advanceTimersByTime(10_000);
			element?.dispatchEvent(new Event('playing'));
			vi.advanceTimersByTime(40_000);

			expect(callbacks.onDiagnostic).not.toHaveBeenCalled();
		});
	});

	test('a switch keeps the old element loaded and quiet until the next one plays', async () => {
		const callbacks = createCallbacks();
		const engine = createAudioEngine(callbacks);
		const outgoing = engine.element;

		await engine.load(request);
		engine.silence();

		const incoming = engine.element;

		await engine.load({ resumeAtSeconds: 0, src: 'https://api.test/b' });
		outgoing.dispatchEvent(new Event('pause'));

		expect(incoming).not.toBe(outgoing);
		expect(outgoing.getAttribute('src')).toBe(request.src);
		expect(callbacks.onStatus).not.toHaveBeenCalledWith('paused');

		incoming.dispatchEvent(new Event('playing'));

		expect(outgoing.hasAttribute('src')).toBe(false);
		expect(incoming.getAttribute('src')).toBe('https://api.test/b');
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
